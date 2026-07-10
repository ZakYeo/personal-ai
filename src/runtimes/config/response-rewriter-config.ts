import type { OpenAIIntentConfig } from "../../ports/assistant.js";
import { selectConfiguredRuntimeEntry } from "../runtime-selector.js";
import {
  isRecord,
  parseOptionalNonEmptyString,
  parseOptionalPositiveInteger,
} from "./config-parse-utils.js";

export type ResolvedResponseRewriterConfig =
  | {
      provider: "disabled";
    }
  | {
      openai: OpenAIIntentConfig;
      provider: "openai";
    };

export interface ParsedResponseRewriterConfig {
  openai?: OpenAIIntentConfig;
  provider: string;
}

export function parseResponseRewriterConfig(
  value: unknown,
): ParsedResponseRewriterConfig {
  if (value === undefined) {
    return {
      provider: "disabled",
    };
  }

  if (!isRecord(value)) {
    throw new Error("Config responseRewriter must be a JSON object.");
  }

  if (typeof value.provider !== "string" || value.provider.length === 0) {
    throw new Error(
      "Config responseRewriter.provider must be a non-empty string.",
    );
  }

  return {
    provider: value.provider,
    ...parseOpenAIResponseRewriterConfig(value.openai),
  };
}

export function requireResponseRewriterConfig(config: {
  responseRewriter: ParsedResponseRewriterConfig;
}): ResolvedResponseRewriterConfig {
  const resolveResponseRewriter = selectConfiguredRuntimeEntry({
    configuredId: config.responseRewriter.provider,
    missingMessage: "Config responseRewriter.provider must be configured.",
    registry: {
      disabled: () =>
        ({
          provider: "disabled",
        }) as const,
      openai: () => {
        if (!config.responseRewriter.openai) {
          throw new Error("Config responseRewriter.openai must be configured.");
        }

        return {
          openai: config.responseRewriter.openai,
          provider: "openai",
        } as const;
      },
    },
    unknownMessage: (provider) =>
      `Config responseRewriter.provider "${provider}" is not registered.`,
  });

  return resolveResponseRewriter();
}

function parseOpenAIResponseRewriterConfig(
  value: unknown,
): Pick<ParsedResponseRewriterConfig, "openai"> {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error("Config responseRewriter.openai must be a JSON object.");
  }

  if (typeof value.model !== "string" || value.model.length === 0) {
    throw new Error(
      "Config responseRewriter.openai.model must be a non-empty string.",
    );
  }

  return {
    openai: {
      apiKeyEnv: parseOptionalNonEmptyString(
        value.apiKeyEnv,
        "Config responseRewriter.openai.apiKeyEnv must be a non-empty string.",
        "OPENAI_API_KEY",
      ),
      baseUrl: parseOptionalNonEmptyString(
        value.baseUrl,
        "Config responseRewriter.openai.baseUrl must be a non-empty string.",
        "https://api.openai.com/v1",
      ),
      model: value.model,
      timeoutMs: parseOptionalPositiveInteger(
        value.timeoutMs,
        "Config responseRewriter.openai.timeoutMs must be a positive integer.",
        30_000,
      ),
    },
  };
}
