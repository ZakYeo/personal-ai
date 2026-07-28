import type { WeatherLocation } from "../../ports/weather.js";
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
    !isCountryCode(value.country_code) ||
    !isCoordinate(value.latitude, -90, 90) ||
    !isCoordinate(value.longitude, -180, 180) ||
    !isValidTimezone(value.timezone) ||
    (value.admin1 !== undefined && !isNonEmptyString(value.admin1))
  ) {
    throw malformedGeocoding();
  }

  const region =
    typeof value.admin1 === "string" &&
    value.admin1.trim() !== value.name.trim()
      ? `, ${value.admin1.trim()}`
      : "";
  return {
    countryCode: value.country_code,
    latitude: value.latitude,
    longitude: value.longitude,
    name: `${value.name.trim()}${region}`,
    timezone: value.timezone,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCountryCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{2}$/u.test(value);
}

function isCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isValidTimezone(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function malformedGeocoding(): OpenMeteoWeatherError {
  return new OpenMeteoWeatherError(
    "Open-Meteo returned malformed geocoding data.",
  );
}
