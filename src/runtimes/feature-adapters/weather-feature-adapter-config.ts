import type { OpenMeteoWeatherConfig } from "../../adapters/open-meteo/open-meteo-client.js";
import {
  isRecord,
  parseOptionalPositiveInteger,
} from "../config/config-parse-utils.js";

export interface WeatherFeatureConfig {
  maxForecastAgeMinutes: number;
}

export interface WeatherOpenMeteoAdapterConfig extends WeatherFeatureConfig {
  openMeteo: OpenMeteoWeatherConfig;
}

const freeForecastUrl = "https://api.open-meteo.com/v1/forecast";
const freeGeocodingUrl = "https://geocoding-api.open-meteo.com/v1/search";
const defaultTimeoutMs = 30_000;
const maxTimeoutMs = 120_000;
const maxForecastAgeMinutes = 24 * 60;
const openMeteoFields = new Set(["forecastUrl", "geocodingUrl", "timeoutMs"]);
const credentialField =
  /^(?:api[-_]?key(?:env)?|authorization|credential(?:s)?|secret|token)$/iu;

export function parseWeatherFeatureConfig(
  featureConfig: Record<string, unknown>,
): WeatherFeatureConfig {
  const maxAge = parseOptionalPositiveInteger(
    featureConfig.maxForecastAgeMinutes,
    'Config feature "weather".maxForecastAgeMinutes must be an integer from 1 to 1440.',
    360,
  );
  if (maxAge > maxForecastAgeMinutes) {
    throw new Error(
      'Config feature "weather".maxForecastAgeMinutes must be an integer from 1 to 1440.',
    );
  }
  return { maxForecastAgeMinutes: maxAge };
}

export function parseWeatherOpenMeteoAdapterConfig(
  featureConfig: Record<string, unknown>,
): WeatherOpenMeteoAdapterConfig {
  rejectCredentialFields(featureConfig);
  return {
    ...parseWeatherFeatureConfig(featureConfig),
    openMeteo: parseOpenMeteoConfig(featureConfig.openMeteo),
  };
}

function parseOpenMeteoConfig(value: unknown): OpenMeteoWeatherConfig {
  if (value !== undefined && !isRecord(value)) {
    throw new Error(
      'Config feature "weather".openMeteo must be a JSON object.',
    );
  }
  const config = value ?? {};
  rejectCredentialFields(config);
  rejectUnknownFields(config);

  const forecastUrl = parseEndpoint(
    config.forecastUrl,
    freeForecastUrl,
    'Config feature "weather".openMeteo.forecastUrl must use the official free non-commercial forecast endpoint.',
  );
  const geocodingUrl = parseEndpoint(
    config.geocodingUrl,
    freeGeocodingUrl,
    'Config feature "weather".openMeteo.geocodingUrl must use the official free geocoding endpoint.',
  );
  const timeoutMs = parseOptionalPositiveInteger(
    config.timeoutMs,
    'Config feature "weather".openMeteo.timeoutMs must be an integer from 1 to 120000.',
    defaultTimeoutMs,
  );
  if (timeoutMs > maxTimeoutMs) {
    throw new Error(
      'Config feature "weather".openMeteo.timeoutMs must be an integer from 1 to 120000.',
    );
  }
  return { forecastUrl, geocodingUrl, timeoutMs };
}

function rejectCredentialFields(config: Record<string, unknown>): void {
  if (containsCredentialField(config)) {
    throw new Error(
      'Config feature "weather".openMeteo must not configure credentials.',
    );
  }
}

function containsCredentialField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCredentialField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([field, nested]) =>
      credentialField.test(field) || containsCredentialField(nested),
  );
}

function rejectUnknownFields(config: Record<string, unknown>): void {
  const unknown = Object.keys(config).find(
    (field) => !openMeteoFields.has(field),
  );
  if (unknown) {
    throw new Error(
      `Config feature "weather".openMeteo field "${unknown}" is not supported.`,
    );
  }
}

function parseEndpoint(
  value: unknown,
  required: string,
  message: string,
): string {
  if (value === undefined) return required;
  if (value !== required) throw new Error(message);
  return value;
}
