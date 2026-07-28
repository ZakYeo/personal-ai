import type {
  WeatherForecast,
  WeatherLocation,
  WeatherPeriod,
  WeatherUnits,
} from "../../ports/weather.js";

export const metricWeatherUnits = Object.freeze({
  precipitation: "mm",
  temperature: "celsius",
  windSpeed: "km/h",
} as const satisfies WeatherUnits);

const maxLocationResults = 10;
const maxForecastDays = 16;
const futureToleranceMs = 5 * 60_000;

export function createCurrentWeatherPeriod(now: Date): WeatherPeriod {
  const timestamp = now.toISOString();
  return { endAt: timestamp, startAt: timestamp };
}

export function createForecastWeatherPeriod(
  args: { endAt?: string; location?: string; startAt?: string },
  now: Date,
): WeatherPeriod {
  const start = parseTimestamp(args.startAt ?? now.toISOString(), "startAt");
  const end = parseTimestamp(
    args.endAt ?? new Date(start.getTime() + 24 * 60 * 60_000).toISOString(),
    "endAt",
  );
  if (
    end.getTime() < start.getTime() ||
    end.getTime() - start.getTime() > maxForecastDays * 24 * 60 * 60_000
  ) {
    throw new Error(
      `Weather forecast periods must be ordered and no longer than ${maxForecastDays} days.`,
    );
  }
  return { endAt: end.toISOString(), startAt: start.toISOString() };
}

export function validateWeatherLocations(
  locations: readonly WeatherLocation[],
): void {
  if (
    locations.length > maxLocationResults ||
    locations.some(
      (location) =>
        location.name.trim().length === 0 ||
        !/^[A-Z]{2}$/u.test(location.countryCode) ||
        !Number.isFinite(location.latitude) ||
        location.latitude < -90 ||
        location.latitude > 90 ||
        !Number.isFinite(location.longitude) ||
        location.longitude < -180 ||
        location.longitude > 180 ||
        !isTimeZone(location.timezone),
    )
  ) {
    throw new Error("Weather location results were malformed or ambiguous.");
  }
}

export function validateWeatherForecast(
  forecast: WeatherForecast,
  location: WeatherLocation,
  period: WeatherPeriod,
): void {
  if (
    JSON.stringify(forecast.location) !== JSON.stringify(location) ||
    JSON.stringify(forecast.period) !== JSON.stringify(period) ||
    JSON.stringify(forecast.units) !== JSON.stringify(metricWeatherUnits) ||
    forecast.attribution.name.trim().length === 0 ||
    !isHttpUrl(forecast.attribution.url) ||
    !isIsoTimestamp(forecast.fetchedAt) ||
    !isCurrentObservation(forecast.current) ||
    forecast.hourly.length > maxForecastDays * 24 ||
    forecast.daily.length > maxForecastDays ||
    forecast.hourly.some(
      (item) =>
        !isIsoTimestamp(item.forecastAt) ||
        !hasFiniteWeatherValues(item) ||
        item.weather.trim().length === 0,
    ) ||
    forecast.daily.some(
      (item) =>
        !/^\d{4}-\d{2}-\d{2}$/u.test(item.date) ||
        !hasFiniteWeatherValues(item) ||
        !Number.isFinite(item.temperatureMax) ||
        !Number.isFinite(item.temperatureMin) ||
        item.weather.trim().length === 0,
    )
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

function parseTimestamp(value: string, label: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`Weather ${label} must be an exact ISO timestamp.`);
  }
  return parsed;
}

function isCurrentObservation(value: WeatherForecast["current"]): boolean {
  return (
    isIsoTimestamp(value.observedAt) &&
    hasFiniteWeatherValues(value) &&
    value.weather.trim().length > 0
  );
}

function hasFiniteWeatherValues(value: object): boolean {
  return Object.entries(value)
    .filter(
      ([key]) =>
        key !== "forecastAt" &&
        key !== "observedAt" &&
        key !== "date" &&
        key !== "weather",
    )
    .every(([, field]) => typeof field === "number" && Number.isFinite(field));
}

function isIsoTimestamp(value: string): boolean {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
