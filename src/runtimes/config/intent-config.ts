import type { OpenAIIntentConfig } from "../../ports/assistant.js";
import { selectConfiguredRuntimeEntry } from "../runtime-selector.js";
import type { LoadedRuntimeConfig } from "./config.js";

export type ResolvedIntentConfig =
  | { provider: "deterministic" }
  | { openai: OpenAIIntentConfig; provider: "openai" };

export function requireIntentConfig(
  config: LoadedRuntimeConfig,
): ResolvedIntentConfig {
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
