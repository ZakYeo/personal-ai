import { zonedParts } from "./local-date-time.js";
import type {
  DailyWeatherForecast,
  HourlyWeatherForecast,
  WeatherForecast,
  WeatherLocation,
  WeatherLocationCandidate,
  WeatherPeriod,
  WeatherUnits,
} from "../ports/weather.js";

export const metricWeatherUnits = Object.freeze({
  precipitation: "mm",
  temperature: "celsius",
  windSpeed: "km/h",
} as const satisfies WeatherUnits);

const maxLocationResults = 10;
const maxForecastDays = 16;
const maxHourlyFacts = maxForecastDays * 25;
const futureToleranceMs = 5 * 60_000;

export function validateWeatherLocations(
  locations: readonly WeatherLocation[],
): void {
  if (
    locations.length > maxLocationResults ||
    locations.some((location) => !isValidWeatherLocation(location))
  ) {
    throw new Error("Weather location results were malformed or ambiguous.");
  }
}

export function validateWeatherLocationCandidates(
  candidates: readonly WeatherLocationCandidate[],
): void {
  const ranks = new Set<number>();
  if (
    candidates.length > maxLocationResults ||
    candidates.some((candidate) => {
      const validRank =
        Number.isInteger(candidate.providerRank) && candidate.providerRank > 0;
      if (ranks.has(candidate.providerRank)) return true;
      ranks.add(candidate.providerRank);
      return (
        !isValidWeatherLocation(candidate.location) ||
        !isBoundedText(candidate.searchName, 200) ||
        !isBoundedText(candidate.countryName, 200) ||
        !validRank ||
        (candidate.featureCode !== undefined &&
          !isBoundedText(candidate.featureCode, 32)) ||
        (candidate.population !== undefined &&
          (!Number.isSafeInteger(candidate.population) ||
            candidate.population < 0))
      );
    })
  ) {
    throw new Error("Weather location candidates were malformed.");
  }
}

export function assertValidWeatherLocation(location: WeatherLocation): void {
  if (!isValidWeatherLocation(location)) {
    throw new Error("Weather location is invalid.");
  }
}

export function isValidWeatherLocation(location: WeatherLocation): boolean {
  return (
    location.name.trim().length > 0 &&
    location.name.length <= 200 &&
    /^[A-Z]{2}$/u.test(location.countryCode) &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180 &&
    isCanonicalTimeZone(location.timezone)
  );
}

export function isValidWeatherPeriod(period: WeatherPeriod): boolean {
  if (
    !isCanonicalWeatherTimestamp(period.startAt) ||
    !isCanonicalWeatherTimestamp(period.endAt)
  ) {
    return false;
  }
  const duration =
    new Date(period.endAt).getTime() - new Date(period.startAt).getTime();
  return duration >= 0 && duration <= maxForecastDays * 24 * 60 * 60_000;
}

export function validateWeatherForecast(
  forecast: WeatherForecast,
  location: WeatherLocation,
  period: WeatherPeriod,
): void {
  if (
    !weatherLocationsEqual(forecast.location, location) ||
    !weatherPeriodsEqual(forecast.period, period) ||
    !weatherUnitsEqual(forecast.units, metricWeatherUnits) ||
    !isValidWeatherLocation(forecast.location) ||
    !isValidWeatherPeriod(forecast.period) ||
    !isBoundedText(forecast.attribution.name, 200) ||
    !isHttpUrl(forecast.attribution.url) ||
    !isCanonicalWeatherTimestamp(forecast.fetchedAt) ||
    !isValidCurrentObservation(forecast.current) ||
    forecast.hourly.length > maxHourlyFacts ||
    forecast.daily.length > maxForecastDays ||
    !hasValidHourlyFacts(forecast.hourly, period) ||
    !hasValidDailyFacts(forecast.daily, period, location.timezone)
  ) {
    throw new Error("Weather provider returned malformed forecast data.");
  }
}

export function weatherForecastIsStale(
  forecast: WeatherForecast,
  now: Date,
  maxForecastAgeMs: number,
): boolean {
  const observedAt = new Date(forecast.current.observedAt).getTime();
  const age = now.getTime() - observedAt;
  if (age < -futureToleranceMs) {
    throw new Error("Weather provider returned future-dated freshness data.");
  }
  return age > maxForecastAgeMs;
}

export function isCanonicalWeatherTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

export function isCanonicalWeatherDate(value: unknown): value is string {
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

function hasValidHourlyFacts(
  facts: readonly HourlyWeatherForecast[],
  period: WeatherPeriod,
): boolean {
  let previousTimestamp: string | undefined;
  return facts.every((fact) => {
    if (
      !isCanonicalWeatherTimestamp(fact.forecastAt) ||
      fact.forecastAt < period.startAt ||
      fact.forecastAt > period.endAt ||
      (previousTimestamp !== undefined &&
        fact.forecastAt <= previousTimestamp) ||
      !hasValidWeatherValues(fact)
    ) {
      return false;
    }
    previousTimestamp = fact.forecastAt;
    return true;
  });
}

function hasValidDailyFacts(
  facts: readonly DailyWeatherForecast[],
  period: WeatherPeriod,
  timeZone: string,
): boolean {
  const startDate = weatherLocalDate(period.startAt, timeZone);
  const endDate = weatherLocalDate(period.endAt, timeZone);
  let previousDate: string | undefined;
  return facts.every((fact) => {
    if (
      !isCanonicalWeatherDate(fact.date) ||
      fact.date < startDate ||
      fact.date > endDate ||
      (previousDate !== undefined && fact.date <= previousDate) ||
      !Number.isFinite(fact.temperatureMin) ||
      !Number.isFinite(fact.temperatureMax) ||
      fact.temperatureMin > fact.temperatureMax ||
      !isNonNegativeNumber(fact.precipitation) ||
      !isNonNegativeNumber(fact.windSpeedMax) ||
      !isBoundedText(fact.weather, 200)
    ) {
      return false;
    }
    previousDate = fact.date;
    return true;
  });
}

function isValidCurrentObservation(value: WeatherForecast["current"]): boolean {
  return (
    isCanonicalWeatherTimestamp(value.observedAt) &&
    hasValidWeatherValues(value)
  );
}

function hasValidWeatherValues(value: {
  precipitation: number;
  temperature: number;
  weather: string;
  windSpeed: number;
}): boolean {
  return (
    isNonNegativeNumber(value.precipitation) &&
    Number.isFinite(value.temperature) &&
    isNonNegativeNumber(value.windSpeed) &&
    isBoundedText(value.weather, 200)
  );
}

function weatherLocationsEqual(
  left: WeatherLocation,
  right: WeatherLocation,
): boolean {
  return (
    left.countryCode === right.countryCode &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.name === right.name &&
    left.timezone === right.timezone
  );
}

function weatherPeriodsEqual(
  left: WeatherPeriod,
  right: WeatherPeriod,
): boolean {
  return left.startAt === right.startAt && left.endAt === right.endAt;
}

function weatherUnitsEqual(left: WeatherUnits, right: WeatherUnits): boolean {
  return (
    left.precipitation === right.precipitation &&
    left.temperature === right.temperature &&
    left.windSpeed === right.windSpeed
  );
}

export function weatherLocalDate(timestamp: string, timeZone: string): string {
  const parts = zonedParts(new Date(timestamp), timeZone);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

function isNonNegativeNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isBoundedText(value: string, maximumLength: number): boolean {
  return value.trim().length > 0 && value.length <= maximumLength;
}

function isHttpUrl(value: string): boolean {
  if (value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isCanonicalTimeZone(value: string): boolean {
  try {
    return (
      new Intl.DateTimeFormat("en", {
        timeZone: value,
      }).resolvedOptions().timeZone === value
    );
  } catch {
    return false;
  }
}
