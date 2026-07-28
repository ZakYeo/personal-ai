import { resolveLocalDateTime } from "../../ports/local-date-time.js";
import { isRecord } from "../parsing.js";
import { OpenMeteoWeatherError } from "./open-meteo-error.js";

export function parseParallelArrays(
  value: Record<string, unknown>,
  names: string[],
): Record<string, unknown>[] {
  const arrays: unknown[][] = [];
  for (const name of names) {
    const array = value[name];
    if (!Array.isArray(array)) throw malformedOpenMeteoForecast();
    arrays.push(array);
  }
  const length = arrays[0]?.length ?? 0;
  if (!arrays.every((array) => array.length === length)) {
    throw malformedOpenMeteoForecast();
  }
  return Array.from({ length }, (_, index) =>
    Object.fromEntries(
      names.map((name, nameIndex) => [name, arrays[nameIndex]![index]]),
    ),
  );
}

export function hasExactOpenMeteoForecastUnits(
  value: Record<string, unknown>,
): boolean {
  return (
    unitsMatch(value.current_units, {
      precipitation: "mm",
      temperature_2m: "°C",
      time: "iso8601",
      weather_code: "wmo code",
      wind_speed_10m: "km/h",
    }) &&
    unitsMatch(value.hourly_units, {
      precipitation: "mm",
      temperature_2m: "°C",
      time: "iso8601",
      weather_code: "wmo code",
      wind_speed_10m: "km/h",
    }) &&
    unitsMatch(value.daily_units, {
      precipitation_sum: "mm",
      temperature_2m_max: "°C",
      temperature_2m_min: "°C",
      time: "iso8601",
      weather_code: "wmo code",
      wind_speed_10m_max: "km/h",
    })
  );
}

export function parseOpenMeteoLocalTimestamp(
  value: unknown,
  timezone: string,
): string {
  if (typeof value !== "string") throw malformedOpenMeteoForecast();
  const match =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})$/u.exec(
      value,
    );
  if (!match?.groups) throw malformedOpenMeteoForecast();
  const parts = {
    day: Number(match.groups.day),
    hour: Number(match.groups.hour),
    millisecond: 0,
    minute: Number(match.groups.minute),
    month: Number(match.groups.month),
    second: 0,
    year: Number(match.groups.year),
  };
  if (!validDateTimeParts(parts)) throw malformedOpenMeteoForecast();
  try {
    return resolveLocalDateTime(parts, timezone).toISOString();
  } catch (error) {
    throw malformedOpenMeteoForecast(error);
  }
}

export function isOpenMeteoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(value);
  if (!match?.groups) return false;
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const rendered = new Date(Date.UTC(year, month - 1, day));
  return (
    rendered.getUTCFullYear() === year &&
    rendered.getUTCMonth() === month - 1 &&
    rendered.getUTCDate() === day
  );
}

export function isFiniteWeatherNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isNonNegativeWeatherNumber(value: unknown): value is number {
  return isFiniteWeatherNumber(value) && value >= 0;
}

export function malformedOpenMeteoForecast(
  cause?: unknown,
): OpenMeteoWeatherError {
  return new OpenMeteoWeatherError(
    "Open-Meteo returned malformed forecast data.",
    undefined,
    undefined,
    cause === undefined ? undefined : { cause },
  );
}

function unitsMatch(value: unknown, expected: Record<string, string>): boolean {
  return (
    isRecord(value) &&
    Object.entries(expected).every(([name, unit]) => value[name] === unit)
  );
}

function validDateTimeParts(parts: {
  day: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
}): boolean {
  if (
    parts.hour > 23 ||
    parts.minute > 59 ||
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1
  ) {
    return false;
  }
  const rendered = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return (
    rendered.getUTCFullYear() === parts.year &&
    rendered.getUTCMonth() === parts.month - 1 &&
    rendered.getUTCDate() === parts.day
  );
}
