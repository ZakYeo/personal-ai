import {
  zonedParts,
  type LocalDateTimeParts,
} from "../../ports/local-date-time.js";
import {
  type WeatherForecast,
  type WeatherForecastRequest,
  type WeatherLocationQuery,
  type WeatherProviderPort,
  type WeatherRequestOptions,
} from "../../ports/weather.js";
import {
  fetchOpenMeteoJson,
  type OpenMeteoWeatherConfig,
} from "./open-meteo-client.js";
import { OpenMeteoWeatherError } from "./open-meteo-error.js";
import { parseOpenMeteoForecast } from "./open-meteo-forecast-parser.js";
import { parseOpenMeteoLocations } from "./open-meteo-geocoding-parser.js";

interface OpenMeteoWeatherProviderOptions {
  config: OpenMeteoWeatherConfig;
  fetch: typeof fetch;
  now(): Date;
}

const currentVariables =
  "temperature_2m,precipitation,weather_code,wind_speed_10m";
const dailyVariables =
  "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max";

export function createOpenMeteoWeatherProvider(
  options: OpenMeteoWeatherProviderOptions,
): WeatherProviderPort {
  return {
    async findLocations(
      query: WeatherLocationQuery,
      requestOptions: WeatherRequestOptions,
    ) {
      const place = query.place.trim();
      if (!place) {
        throw new OpenMeteoWeatherError(
          "Open-Meteo geocoding requires a non-empty place.",
        );
      }
      const body = await fetchOpenMeteoJson({
        config: options.config,
        fetch: options.fetch,
        operation: "geocoding",
        ...(requestOptions.signal ? { signal: requestOptions.signal } : {}),
        url: createGeocodingUrl(options.config, place),
      });
      return parseOpenMeteoLocations(body);
    },

    async getForecast(
      request: WeatherForecastRequest,
      requestOptions: WeatherRequestOptions,
    ): Promise<WeatherForecast> {
      validateMetricRequest(request);
      const body = await fetchOpenMeteoJson({
        config: options.config,
        fetch: options.fetch,
        operation: "forecast",
        ...(requestOptions.signal ? { signal: requestOptions.signal } : {}),
        url: createForecastUrl(options.config, request),
      });
      const parsed = parseOpenMeteoForecast(body, request);
      return {
        attribution: {
          name: "Weather data by Open-Meteo.com",
          url: "https://open-meteo.com/",
        },
        ...parsed,
        fetchedAt: options.now().toISOString(),
        location: request.location,
        period: request.period,
        units: request.units,
      };
    },
  };
}

function createGeocodingUrl(
  config: OpenMeteoWeatherConfig,
  place: string,
): string {
  const url = cleanEndpoint(config.geocodingUrl);
  url.searchParams.set("name", place);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  return url.toString();
}

function createForecastUrl(
  config: OpenMeteoWeatherConfig,
  request: WeatherForecastRequest,
): string {
  const url = cleanEndpoint(config.forecastUrl);
  url.searchParams.set("latitude", String(request.location.latitude));
  url.searchParams.set("longitude", String(request.location.longitude));
  url.searchParams.set("current", currentVariables);
  url.searchParams.set("hourly", currentVariables);
  url.searchParams.set("daily", dailyVariables);
  url.searchParams.set(
    "start_date",
    localDate(new Date(request.period.startAt), request.location.timezone),
  );
  url.searchParams.set(
    "end_date",
    localDate(new Date(request.period.endAt), request.location.timezone),
  );
  url.searchParams.set("timezone", request.location.timezone);
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("precipitation_unit", "mm");
  url.searchParams.set("timeformat", "iso8601");
  return url.toString();
}

function cleanEndpoint(value: string): URL {
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  return url;
}

function localDate(instant: Date, timezone: string): string {
  if (!Number.isFinite(instant.getTime())) {
    throw new OpenMeteoWeatherError(
      "Open-Meteo forecast request has an invalid period.",
    );
  }
  let parts: LocalDateTimeParts;
  try {
    parts = zonedParts(instant, timezone);
  } catch (error) {
    throw new OpenMeteoWeatherError(
      "Open-Meteo forecast request has an invalid timezone.",
      undefined,
      undefined,
      { cause: error },
    );
  }
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

function validateMetricRequest(request: WeatherForecastRequest): void {
  if (
    request.units.temperature !== "celsius" ||
    request.units.precipitation !== "mm" ||
    request.units.windSpeed !== "km/h"
  ) {
    throw new OpenMeteoWeatherError(
      "Open-Meteo weather requests currently require metric units.",
    );
  }
  const start = new Date(request.period.startAt).getTime();
  const end = new Date(request.period.endAt).getTime();
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start ||
    end - start > 16 * 24 * 60 * 60 * 1_000
  ) {
    throw new OpenMeteoWeatherError(
      "Open-Meteo forecast request has an invalid period.",
    );
  }
  const startDate = localDate(new Date(start), request.location.timezone);
  const endDate = localDate(new Date(end), request.location.timezone);
  const calendarDays =
    (Date.parse(`${endDate}T00:00:00.000Z`) -
      Date.parse(`${startDate}T00:00:00.000Z`)) /
      (24 * 60 * 60_000) +
    1;
  if (calendarDays > 16) {
    throw new OpenMeteoWeatherError(
      "Open-Meteo forecast request spans more than 16 local calendar dates.",
    );
  }
}
