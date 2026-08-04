import { env } from "node:process";

import type { WeatherUnits } from "../../ports/weather.js";
import { createOpenMeteoWeatherProvider } from "./open-meteo-weather.js";

const runOpenMeteoE2E = env.PERSONAL_AI_RUN_OPEN_METEO_E2E === "1";
const metricWeatherUnits = {
  precipitation: "mm",
  temperature: "celsius",
  windSpeed: "km/h",
} as const satisfies WeatherUnits;

describe.skipIf(!runOpenMeteoE2E)("Open-Meteo live read E2E", () => {
  it("resolves London and returns an attributed keyless forecast", async () => {
    const provider = createOpenMeteoWeatherProvider({
      config: {
        forecastUrl: "https://api.open-meteo.com/v1/forecast",
        geocodingUrl: "https://geocoding-api.open-meteo.com/v1/search",
        timeoutMs: 30_000,
      },
      fetch: globalThis.fetch,
      now: () => new Date(),
    });
    const locations = await provider.findLocations({ place: "London" }, {});
    const location = locations.find(
      (candidate) =>
        candidate.location.countryCode === "GB" &&
        candidate.location.timezone === "Europe/London",
    );
    expect(location).toBeDefined();
    if (!location) throw new Error("Live geocoding did not return London.");
    const start = new Date();
    const end = new Date(start.getTime() + 60 * 60_000);

    const forecast = await provider.getForecast(
      {
        location: location.location,
        period: {
          endAt: end.toISOString(),
          startAt: start.toISOString(),
        },
        units: metricWeatherUnits,
      },
      {},
    );

    expect(forecast.attribution).toEqual({
      name: "Weather data by Open-Meteo.com",
      url: "https://open-meteo.com/",
    });
    expect(forecast.location).toEqual(location.location);
    expect(forecast.current.observedAt).toMatch(/Z$/u);
    expect(Number.isFinite(forecast.current.temperature)).toBe(true);
  }, 60_000);
});
