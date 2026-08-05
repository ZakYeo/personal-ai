import {
  isOpenAIReasoningEffort,
  type OpenAIResponsesConfig,
} from "../../adapters/openai/openai-responses-config.js";
import {
  isRecord,
  parseOptionalNonEmptyString,
  parseOptionalPositiveInteger,
} from "./config-parse-utils.js";

export function parseOptionalOpenAIResponsesConfig(
  value: unknown,
  configPath: string,
): OpenAIResponsesConfig | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${configPath} must be a JSON object.`);
  }

  if (typeof value.model !== "string" || value.model.length === 0) {
    throw new Error(`${configPath}.model must be a non-empty string.`);
  }

  const reasoningEffort = parseReasoningEffort(
    value.reasoningEffort,
    configPath,
  );

  return {
    apiKeyEnv: parseOptionalNonEmptyString(
      value.apiKeyEnv,
      `${configPath}.apiKeyEnv must be a non-empty string.`,
      "OPENAI_API_KEY",
    ),
    baseUrl: parseOptionalNonEmptyString(
      value.baseUrl,
      `${configPath}.baseUrl must be a non-empty string.`,
      "https://api.openai.com/v1",
    ),
    model: value.model,
    ...(reasoningEffort ? { reasoningEffort } : {}),
    timeoutMs: parseOptionalPositiveInteger(
      value.timeoutMs,
      `${configPath}.timeoutMs must be a positive integer.`,
      30_000,
    ),
  };
}

function parseReasoningEffort(
  value: unknown,
  configPath: string,
): OpenAIResponsesConfig["reasoningEffort"] {
  if (value === undefined) {
    return undefined;
  }

  if (!isOpenAIReasoningEffort(value)) {
    throw new Error(
      `${configPath}.reasoningEffort must be one of "none", "low", "medium", "high", "xhigh", or "max".`,
    );
  }

  return value;
}

export function parseOpenAIResponsesConfig(
  value: unknown,
  path: string,
): OpenAIResponsesConfig {
  const config = parseOptionalOpenAIResponsesConfig(value, path);

  if (!config) {
    throw new Error(`${path} must be configured.`);
  }

  return config;
}
