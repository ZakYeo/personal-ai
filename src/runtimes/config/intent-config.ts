import type { OpenAIResponsesConfig } from "../../adapters/openai/openai-responses-config.js";
import { selectConfiguredRuntimeEntry } from "../runtime-selector.js";
import { parseOptionalOpenAIResponsesConfig } from "./openai-responses-config.js";

export type ResolvedIntentConfig =
  | { provider: "deterministic" }
  | { openai: OpenAIResponsesConfig; provider: "openai" };

export interface ParsedIntentConfig {
  openai?: OpenAIResponsesConfig;
  provider: string;
}

export function parseIntentConfig(
  intent: Record<string, unknown>,
): ParsedIntentConfig {
  const openai = parseOptionalOpenAIResponsesConfig(
    intent.openai,
    "Config intent.openai",
  );

  return {
    provider: intent.provider as string,
    ...(openai ? { openai } : {}),
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
