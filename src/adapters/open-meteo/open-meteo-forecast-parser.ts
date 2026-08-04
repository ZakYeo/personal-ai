import type {
  CurrentWeatherObservation,
  DailyWeatherForecast,
  HourlyWeatherForecast,
  WeatherForecastRequest,
} from "../../ports/weather.js";
import {
  isCanonicalWeatherDate,
  weatherLocalDate,
} from "../../application/weather-policy.js";
import { isRecord } from "../parsing.js";
import {
  hasExactOpenMeteoForecastUnits,
  isFiniteWeatherNumber,
  isNonNegativeWeatherNumber,
  malformedOpenMeteoForecast,
  parseOpenMeteoLocalTimestamp,
  parseParallelArrays,
} from "./open-meteo-forecast-primitives.js";
import { describeOpenMeteoWeatherCode } from "./open-meteo-weather-code.js";

interface ParsedOpenMeteoForecast {
  current: CurrentWeatherObservation;
  daily: DailyWeatherForecast[];
  hourly: HourlyWeatherForecast[];
}

const maxDailyIntervals = 16;
const maxHourlyIntervals = maxDailyIntervals * 24;

export function parseOpenMeteoForecast(
  value: unknown,
  request: WeatherForecastRequest,
): ParsedOpenMeteoForecast {
  if (
    !isRecord(value) ||
    value.timezone !== request.location.timezone ||
    !hasExactOpenMeteoForecastUnits(value)
  ) {
    throw malformedOpenMeteoForecast();
  }

  return {
    current: parseCurrent(value.current, request.location.timezone),
    daily: parseDaily(value.daily, request.location.timezone, request.period),
    hourly: parseHourly(
      value.hourly,
      request.location.timezone,
      request.period,
    ),
  };
}

function parseCurrent(
  value: unknown,
  timezone: string,
): CurrentWeatherObservation {
  if (!isRecord(value)) throw malformedOpenMeteoForecast();
  const weather = describeOpenMeteoWeatherCode(value.weather_code);
  if (
    !weather ||
    !isFiniteWeatherNumber(value.temperature_2m) ||
    !isNonNegativeWeatherNumber(value.precipitation) ||
    !isNonNegativeWeatherNumber(value.wind_speed_10m)
  ) {
    throw malformedOpenMeteoForecast();
  }
  return {
    observedAt: parseOpenMeteoLocalTimestamp(value.time, timezone),
    precipitation: value.precipitation,
    temperature: value.temperature_2m,
    weather,
    windSpeed: value.wind_speed_10m,
  };
}

function parseHourly(
  value: unknown,
  timezone: string,
  period: WeatherForecastRequest["period"],
): HourlyWeatherForecast[] {
  if (!isRecord(value)) throw malformedOpenMeteoForecast();
  const rows = parseParallelArrays(value, [
    "time",
    "temperature_2m",
    "precipitation",
    "weather_code",
    "wind_speed_10m",
  ]);
  if (rows.length > maxHourlyIntervals) throw malformedOpenMeteoForecast();

  const start = new Date(period.startAt).getTime();
  const end = new Date(period.endAt).getTime();
  return rows
    .map((row) => parseHourlyRow(row, timezone))
    .filter(({ forecastAt }) => {
      const instant = new Date(forecastAt).getTime();
      return instant >= start && instant <= end;
    });
}

function parseHourlyRow(
  row: Record<string, unknown>,
  timezone: string,
): HourlyWeatherForecast {
  const weather = describeOpenMeteoWeatherCode(row.weather_code);
  if (
    !weather ||
    !isFiniteWeatherNumber(row.temperature_2m) ||
    !isNonNegativeWeatherNumber(row.precipitation) ||
    !isNonNegativeWeatherNumber(row.wind_speed_10m)
  ) {
    throw malformedOpenMeteoForecast();
  }
  return {
    forecastAt: parseOpenMeteoLocalTimestamp(row.time, timezone),
    precipitation: row.precipitation,
    temperature: row.temperature_2m,
    weather,
    windSpeed: row.wind_speed_10m,
  };
}

function parseDaily(
  value: unknown,
  timezone: string,
  period: WeatherForecastRequest["period"],
): DailyWeatherForecast[] {
  if (!isRecord(value)) throw malformedOpenMeteoForecast();
  const rows = parseParallelArrays(value, [
    "time",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "weather_code",
    "wind_speed_10m_max",
  ]);
  if (rows.length > maxDailyIntervals) throw malformedOpenMeteoForecast();
  const firstDate = weatherLocalDate(period.startAt, timezone);
  const lastDate = weatherLocalDate(period.endAt, timezone);
  return rows
    .map(parseDailyRow)
    .filter(({ date }) => date >= firstDate && date <= lastDate);
}

function parseDailyRow(row: Record<string, unknown>): DailyWeatherForecast {
  const weather = describeOpenMeteoWeatherCode(row.weather_code);
  if (
    !isCanonicalWeatherDate(row.time) ||
    !weather ||
    !isFiniteWeatherNumber(row.temperature_2m_max) ||
    !isFiniteWeatherNumber(row.temperature_2m_min) ||
    !isNonNegativeWeatherNumber(row.precipitation_sum) ||
    !isNonNegativeWeatherNumber(row.wind_speed_10m_max)
  ) {
    throw malformedOpenMeteoForecast();
  }
  return {
    date: row.time,
    precipitation: row.precipitation_sum,
    temperatureMax: row.temperature_2m_max,
    temperatureMin: row.temperature_2m_min,
    weather,
    windSpeedMax: row.wind_speed_10m_max,
  };
}
