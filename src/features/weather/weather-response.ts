import type { WeatherForecast, WeatherUnits } from "../../ports/weather.js";
import {
  qualitativeWeatherDetails,
  type WeatherTemporalMode,
} from "./weather-condition-summary.js";
import {
  weatherAttributionText,
  weatherResultEnvelope,
} from "./weather-result-envelope.js";

interface WeatherResponseOptions {
  includePrecipitation: boolean;
  includeWind: boolean;
  now: Date;
}

export function currentWeatherResult(
  forecast: WeatherForecast,
  options: WeatherResponseOptions,
) {
  const { current, location, units } = forecast;
  const details = formatWeatherDetails(current, units, options, "current");
  return weatherResultEnvelope(forecast, {
    data: {
      observedAt: current.observedAt,
      precipitation: current.precipitation,
      temperature: current.temperature,
      weather: current.weather,
      windSpeed: current.windSpeed,
    },
    text: `In ${location.name}, it is ${current.temperature}${formatTemperatureUnit(units.temperature)} and ${current.weather} ${formatObservationAge(current.observedAt, options.now)}.${details} ${weatherAttributionText(forecast)}`,
  });
}

export function forecastWeatherResult(
  forecast: WeatherForecast,
  options: WeatherResponseOptions,
) {
  const hourly = forecast.hourly[0];
  const daily = forecast.daily[0];
  const summary = [
    hourly
      ? `At ${hourly.forecastAt}: ${hourly.temperature}${formatTemperatureUnit(forecast.units.temperature)} and ${hourly.weather}.${formatWeatherDetails(hourly, forecast.units, options, "forecast")}`
      : undefined,
    daily
      ? `On ${daily.date}: ${daily.temperatureMin}–${daily.temperatureMax}${formatTemperatureUnit(forecast.units.temperature)} and ${daily.weather}.${formatWeatherDetails({ precipitation: daily.precipitation, weather: daily.weather, windSpeed: daily.windSpeedMax }, forecast.units, options, "forecast")}`
      : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ");
  return weatherResultEnvelope(forecast, {
    data: {
      ...flattenDaily(forecast),
      ...flattenHourly(forecast),
    },
    text: `${forecast.location.name}'s forecast: ${summary || "No forecast intervals are available."} ${weatherAttributionText(forecast)}`,
  });
}

function flattenHourly(forecast: WeatherForecast) {
  return forecast.hourly.reduce<Record<string, string | number>>(
    (facts, item, index) => ({
      ...facts,
      [`hourly${index}ForecastAt`]: item.forecastAt,
      [`hourly${index}Precipitation`]: item.precipitation,
      [`hourly${index}Temperature`]: item.temperature,
      [`hourly${index}Weather`]: item.weather,
      [`hourly${index}WindSpeed`]: item.windSpeed,
    }),
    { hourlyCount: forecast.hourly.length },
  );
}

function flattenDaily(forecast: WeatherForecast) {
  return forecast.daily.reduce<Record<string, string | number>>(
    (facts, item, index) => ({
      ...facts,
      [`daily${index}Date`]: item.date,
      [`daily${index}Precipitation`]: item.precipitation,
      [`daily${index}TemperatureMax`]: item.temperatureMax,
      [`daily${index}TemperatureMin`]: item.temperatureMin,
      [`daily${index}Weather`]: item.weather,
      [`daily${index}WindSpeedMax`]: item.windSpeedMax,
    }),
    { dailyCount: forecast.daily.length },
  );
}

function formatTemperatureUnit(unit: WeatherUnits["temperature"]): string {
  return unit === "celsius" ? "°C" : "°F";
}

function formatWeatherDetails(
  conditions: {
    precipitation: number;
    weather: string;
    windSpeed: number;
  },
  units: WeatherUnits,
  options: Pick<WeatherResponseOptions, "includePrecipitation" | "includeWind">,
  mode: WeatherTemporalMode,
): string {
  const details = [
    ...qualitativeWeatherDetails(conditions, mode),
    options.includePrecipitation
      ? `Precipitation is ${conditions.precipitation} ${units.precipitation}.`
      : undefined,
    options.includeWind
      ? `Wind is ${conditions.windSpeed} ${units.windSpeed}.`
      : undefined,
  ].filter((detail): detail is string => detail !== undefined);
  return details.length === 0 ? "" : ` ${details.join(" ")}`;
}

function formatObservationAge(observedAt: string, now: Date): string {
  const ageMinutes = Math.max(
    0,
    Math.round((now.getTime() - new Date(observedAt).getTime()) / 60_000),
  );
  if (ageMinutes <= 10) return "right now";
  if (ageMinutes < 45) return `about ${ageMinutes} minutes ago`;
  if (ageMinutes < 90) return "about an hour ago";
  return `about ${Math.round(ageMinutes / 60)} hours ago`;
}
