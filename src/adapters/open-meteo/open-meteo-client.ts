import { fetchProviderJson } from "../http-json-client.js";
import { OpenMeteoWeatherError } from "./open-meteo-error.js";

export interface OpenMeteoWeatherConfig {
  forecastUrl: string;
  geocodingUrl: string;
  timeoutMs: number;
}

interface FetchOpenMeteoJsonOptions {
  config: OpenMeteoWeatherConfig;
  fetch: typeof fetch;
  operation: "forecast" | "geocoding";
  signal?: AbortSignal;
  url: string;
}

const maxResponseBodyBytes = 512 * 1_024;

export function fetchOpenMeteoJson(
  options: FetchOpenMeteoJsonOptions,
): Promise<unknown> {
  const label = `Open-Meteo ${options.operation}`;
  return fetchProviderJson({
    cancelledMessage: `${label} request was cancelled.`,
    createError: ({ cause, message, responseBody, status }) =>
      new OpenMeteoWeatherError(message, status, responseBody, { cause }),
    fetch: options.fetch,
    invalidJsonMessage: `${label} response body was not valid JSON.`,
    maxResponseBodyBytes,
    nonOkMessage: (status) => `${label} request failed with status ${status}.`,
    request: {
      headers: { accept: "application/json" },
      method: "GET",
    },
    responseBodyTooLargeMessage: `${label} response body exceeded the configured byte limit.`,
    ...(options.signal ? { signal: options.signal } : {}),
    timeoutMessage: `${label} request timed out after ${options.config.timeoutMs}ms.`,
    timeoutMs: options.config.timeoutMs,
    url: options.url,
  });
}
