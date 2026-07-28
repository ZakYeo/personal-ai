import type {
  WeatherForecast,
  WeatherProviderPort,
  WeatherRequestOptions,
} from "../../ports/weather.js";

const london = Object.freeze({
  countryCode: "GB",
  latitude: 51.5074,
  longitude: -0.1278,
  name: "London",
  timezone: "Europe/London",
});

export function createMockWeatherProvider(): WeatherProviderPort {
  return {
    findLocations: (query, options) => {
      throwIfAborted(options);
      return Promise.resolve(
        query.place.trim().toLowerCase() === "london" ? [{ ...london }] : [],
      );
    },
    getForecast: (request, options) => {
      throwIfAborted(options);
      return Promise.resolve(createLondonForecast(request));
    },
  };
}

function createLondonForecast(
  request: Parameters<WeatherProviderPort["getForecast"]>[0],
): WeatherForecast {
  return {
    attribution: {
      name: "Deterministic weather fixture",
      url: "https://example.test/weather-source",
    },
    current: {
      observedAt: "2026-07-28T12:00:00.000Z",
      precipitation: 0,
      temperature: 21,
      weather: "partly cloudy",
      windSpeed: 12,
    },
    daily: [
      {
        date: "2026-07-29",
        precipitation: 1.2,
        temperatureMax: 23,
        temperatureMin: 15,
        weather: "light rain",
        windSpeedMax: 18,
      },
    ],
    fetchedAt: "2026-07-28T12:00:05.000Z",
    hourly: [
      {
        forecastAt: "2026-07-29T09:00:00.000Z",
        precipitation: 0.4,
        temperature: 17,
        weather: "light rain",
        windSpeed: 14,
      },
    ],
    location: { ...request.location },
    period: { ...request.period },
    units: { ...request.units },
  };
}

function throwIfAborted(options: WeatherRequestOptions): void {
  if (!options.signal?.aborted) return;
  throw options.signal.reason instanceof Error
    ? options.signal.reason
    : new Error("Weather request was cancelled.");
}
