import type { WeatherForecastRequest } from "../ports/weather.js";

export function createOpenMeteoGeocodingResponse(): unknown {
  return {
    generationtime_ms: 0.21,
    results: [
      {
        admin1: "England",
        country: "United Kingdom",
        country_code: "GB",
        id: 2_643_743,
        latitude: 51.50853,
        longitude: -0.12574,
        name: "London",
        timezone: "Europe/London",
      },
    ],
  };
}

export function createOpenMeteoForecastResponse(
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    current: {
      precipitation: 0,
      temperature_2m: 21,
      time: "2026-07-28T13:00",
      weather_code: 2,
      wind_speed_10m: 12,
    },
    current_units: {
      precipitation: "mm",
      temperature_2m: "°C",
      time: "iso8601",
      weather_code: "wmo code",
      wind_speed_10m: "km/h",
    },
    daily: {
      precipitation_sum: [1.2],
      temperature_2m_max: [23],
      temperature_2m_min: [15],
      time: ["2026-07-29"],
      weather_code: [61],
      wind_speed_10m_max: [18],
    },
    daily_units: {
      precipitation_sum: "mm",
      temperature_2m_max: "°C",
      temperature_2m_min: "°C",
      time: "iso8601",
      weather_code: "wmo code",
      wind_speed_10m_max: "km/h",
    },
    elevation: 25,
    generationtime_ms: 0.18,
    hourly: {
      precipitation: [0.4],
      temperature_2m: [17],
      time: ["2026-07-29T10:00"],
      weather_code: [61],
      wind_speed_10m: [14],
    },
    hourly_units: {
      precipitation: "mm",
      temperature_2m: "°C",
      time: "iso8601",
      weather_code: "wmo code",
      wind_speed_10m: "km/h",
    },
    latitude: 51.5,
    longitude: -0.120000124,
    timezone: "Europe/London",
    timezone_abbreviation: "BST",
    utc_offset_seconds: 3_600,
    ...overrides,
  };
}

export function createOpenMeteoForecastRequest(): WeatherForecastRequest {
  return {
    location: {
      countryCode: "GB",
      latitude: 51.50853,
      longitude: -0.12574,
      name: "London, England",
      timezone: "Europe/London",
    },
    period: {
      endAt: "2026-07-29T12:00:00.000Z",
      startAt: "2026-07-28T12:00:00.000Z",
    },
    units: {
      precipitation: "mm",
      temperature: "celsius",
      windSpeed: "km/h",
    },
  };
}
