import { createMockWeatherProvider } from "../adapters/mock/mock-weather.js";

export function createWeatherProviderFixture() {
  return createMockWeatherProvider();
}
