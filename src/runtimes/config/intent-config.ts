import type { OpenAIIntentConfig } from "../../ports/assistant.js";
import { selectConfiguredRuntimeEntry } from "../runtime-selector.js";
import {
  isRecord,
  parseOptionalNonEmptyString,
  parseOptionalPositiveInteger,
} from "./config-parse-utils.js";

export type ResolvedIntentConfig =
  | { provider: "deterministic" }
  | { openai: OpenAIIntentConfig; provider: "openai" };

export interface ParsedIntentConfig {
  openai?: OpenAIIntentConfig;
  provider: string;
}

export function parseIntentConfig(
  intent: Record<string, unknown>,
): ParsedIntentConfig {
  return {
    provider: intent.provider as string,
    ...parseOpenAIIntentConfig(intent.openai),
  };
}

function parseOpenAIIntentConfig(
  value: unknown,
): Pick<ParsedIntentConfig, "openai"> {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error("Config intent.openai must be a JSON object.");
  }

  if (typeof value.model !== "string" || value.model.length === 0) {
    throw new Error("Config intent.openai.model must be a non-empty string.");
  }

  return {
    openai: {
      apiKeyEnv: parseOptionalNonEmptyString(
        value.apiKeyEnv,
        "Config intent.openai.apiKeyEnv must be a non-empty string.",
        "OPENAI_API_KEY",
      ),
      baseUrl: parseOptionalNonEmptyString(
        value.baseUrl,
        "Config intent.openai.baseUrl must be a non-empty string.",
        "https://api.openai.com/v1",
      ),
      model: value.model,
      timeoutMs: parseOptionalPositiveInteger(
        value.timeoutMs,
        "Config intent.openai.timeoutMs must be a positive integer.",
        30_000,
      ),
    },
  };
}

export function requireIntentConfig(config: {
  intent: ParsedIntentConfig;
}): ResolvedIntentConfig {
  const resolveIntent = selectConfiguredRuntimeEntry({
    configuredId: config.intent.provider,
    missingMessage: "Config intent.provider must be configured.",
    registry: {
      deterministic: () => ({ provider: "deterministic" }) as const,
      openai: () => {
        if (!config.intent.openai) {
          throw new Error("Config intent.openai must be configured.");
        }

        return {
          openai: config.intent.openai,
          provider: "openai",
        } as const;
      },
    },
    unknownMessage: (provider) =>
      `Config intent.provider "${provider}" is not registered.`,
  });

  return resolveIntent();
}
