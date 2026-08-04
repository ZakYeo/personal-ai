import type { WeatherLocationCandidate } from "../../ports/weather.js";
import {
  assertValidWeatherLocation,
  validateWeatherLocationCandidates,
} from "../../ports/weather-policy.js";
import { isRecord } from "../parsing.js";
import { OpenMeteoWeatherError } from "./open-meteo-error.js";

const maxLocations = 5;

export function parseOpenMeteoLocations(
  value: unknown,
): WeatherLocationCandidate[] {
  if (!isRecord(value)) throw malformedGeocoding();
  if (value.results === undefined) return [];
  if (!Array.isArray(value.results) || value.results.length > maxLocations) {
    throw malformedGeocoding();
  }
  const candidates = value.results.map((location, index) =>
    parseLocation(location, index + 1),
  );
  try {
    validateWeatherLocationCandidates(candidates);
    return candidates;
  } catch {
    throw malformedGeocoding();
  }
}

function parseLocation(
  value: unknown,
  providerRank: number,
): WeatherLocationCandidate {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.name) ||
    typeof value.country_code !== "string" ||
    typeof value.latitude !== "number" ||
    typeof value.longitude !== "number" ||
    typeof value.timezone !== "string" ||
    (value.admin1 !== undefined && !isNonEmptyString(value.admin1)) ||
    (value.country !== undefined && !isNonEmptyString(value.country)) ||
    (value.feature_code !== undefined &&
      !isNonEmptyString(value.feature_code)) ||
    (value.population !== undefined &&
      (typeof value.population !== "number" ||
        !Number.isSafeInteger(value.population) ||
        value.population < 0))
  ) {
    throw malformedGeocoding();
  }

  const region =
    typeof value.admin1 === "string" &&
    value.admin1.trim() !== value.name.trim()
      ? `, ${value.admin1.trim()}`
      : "";
  const location = {
    countryCode: value.country_code,
    latitude: value.latitude,
    longitude: value.longitude,
    name: `${value.name.trim()}${region}`,
    timezone: value.timezone,
  };
  try {
    assertValidWeatherLocation(location);
    return {
      countryName:
        typeof value.country === "string"
          ? value.country.trim()
          : value.country_code,
      ...(typeof value.feature_code === "string"
        ? { featureCode: value.feature_code.trim() }
        : {}),
      location,
      ...(typeof value.population === "number"
        ? { population: value.population }
        : {}),
      providerRank,
      searchName: value.name.trim(),
    };
  } catch {
    throw malformedGeocoding();
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function malformedGeocoding(): OpenMeteoWeatherError {
  return new OpenMeteoWeatherError(
    "Open-Meteo returned malformed geocoding data.",
  );
}
