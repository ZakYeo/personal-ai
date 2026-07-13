import type { OpenAIResponsesConfig } from "../../adapters/openai/openai-responses-config.js";
import { selectConfiguredRuntimeEntry } from "../runtime-selector.js";
import { isRecord } from "./config-parse-utils.js";
import { parseOptionalOpenAIResponsesConfig } from "./openai-responses-config.js";

export type ResolvedResponseRewriterConfig =
  | {
      provider: "disabled";
    }
  | {
      openai: OpenAIResponsesConfig;
      provider: "openai";
    };

export interface ParsedResponseRewriterConfig {
  openai?: OpenAIResponsesConfig;
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

  const openai = parseOptionalOpenAIResponsesConfig(
    value.openai,
    "Config responseRewriter.openai",
  );

  return {
    provider: value.provider,
    ...(openai ? { openai } : {}),
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
