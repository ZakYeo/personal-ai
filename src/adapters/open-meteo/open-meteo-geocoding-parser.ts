import type { WeatherLocation } from "../../ports/weather.js";
import { assertValidWeatherLocation } from "../../ports/weather-policy.js";
import { isRecord } from "../parsing.js";
import { OpenMeteoWeatherError } from "./open-meteo-error.js";

const maxLocations = 5;

export function parseOpenMeteoLocations(value: unknown): WeatherLocation[] {
  if (!isRecord(value)) throw malformedGeocoding();
  if (value.results === undefined) return [];
  if (!Array.isArray(value.results) || value.results.length > maxLocations) {
    throw malformedGeocoding();
  }
  return value.results.map(parseLocation);
}

function parseLocation(value: unknown): WeatherLocation {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.name) ||
    typeof value.country_code !== "string" ||
    typeof value.latitude !== "number" ||
    typeof value.longitude !== "number" ||
    typeof value.timezone !== "string" ||
    (value.admin1 !== undefined && !isNonEmptyString(value.admin1))
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
    return location;
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
