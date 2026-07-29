import type { OpenAIResponsesConfig } from "../../adapters/openai/openai-responses-config.js";
import { parseOpenAIResponsesConfig } from "../config/openai-responses-config.js";
import { parseOptionalPositiveInteger } from "../config/config-parse-utils.js";

interface InternetSearchFeatureConfig {
  maxResults: number;
}

interface InternetSearchOpenAIAdapterConfig extends InternetSearchFeatureConfig {
  openai: OpenAIResponsesConfig;
}

export function parseInternetSearchFeatureConfig(
  featureConfig: Record<string, unknown>,
): InternetSearchFeatureConfig {
  const maxResults = parseOptionalPositiveInteger(
    featureConfig.maxResults,
    'Config feature "internetSearch".maxResults must be an integer from 1 to 10.',
    5,
  );
  if (maxResults > 10) {
    throw new Error(
      'Config feature "internetSearch".maxResults must be an integer from 1 to 10.',
    );
  }

  return { maxResults };
}

export function parseInternetSearchOpenAIAdapterConfig(
  featureConfig: Record<string, unknown>,
): InternetSearchOpenAIAdapterConfig {
  return {
    ...parseInternetSearchFeatureConfig(featureConfig),
    openai: parseOpenAIResponsesConfig(
      featureConfig.openai,
      'Config feature "internetSearch".openai',
    ),
  };
}
