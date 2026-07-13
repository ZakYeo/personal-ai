import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isRecord } from "./config-parse-utils.js";
import { parseDesktopVoiceConfig } from "./desktop-voice-config.js";
import { parseConversationConfig } from "./conversation-config.js";
import { parseFeaturesConfig } from "./feature-config.js";
import { parseIntentConfig } from "./intent-config.js";
import { parseResponseRewriterConfig } from "./response-rewriter-config.js";
import type { LoadedRuntimeConfig } from "./runtime-config.js";
import { parseVoiceConfig } from "./voice-config.js";
import { createDefaultFeatureAdapterRegistry } from "../default-feature-adapter-registry.js";
import type { FeatureAdapterRegistry } from "../feature-adapter-registry.js";
import { createDesktopVoiceProviderAdapterRegistry } from "../voice/desktop-voice-provider-adapter-entries.js";
import type { DesktopVoiceProviderAdapterRegistry } from "../voice/desktop-voice-provider-adapter-registry.js";
import type { IntentProviderRegistry } from "./intent-config.js";
import { createDefaultIntentProviderRegistry } from "../intent-provider-selection.js";

export type { LoadedRuntimeConfig } from "./runtime-config.js";

const defaultConfigPath = fileURLToPath(
  new URL("../../../config/default.json", import.meta.url),
);

interface LoadConfigOptions {
  configPath?: string;
  featureAdapterRegistry?: FeatureAdapterRegistry;
  desktopVoiceProviderAdapterRegistry?: DesktopVoiceProviderAdapterRegistry;
  intentProviderRegistry?: IntentProviderRegistry;
}

interface ParseAssistantConfigOptions {
  featureAdapterRegistry?: FeatureAdapterRegistry;
  desktopVoiceProviderAdapterRegistry?: DesktopVoiceProviderAdapterRegistry;
  intentProviderRegistry?: IntentProviderRegistry;
}

export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<LoadedRuntimeConfig> {
  const configPath = options.configPath ?? defaultConfigPath;
  const rawConfig = await readFile(configPath, "utf8");

  return parseAssistantConfig(JSON.parse(rawConfig), options);
}

export function parseAssistantConfig(
  value: unknown,
  options: ParseAssistantConfigOptions = {},
): LoadedRuntimeConfig {
  if (!isRecord(value)) {
    throw new Error("Config must be a JSON object.");
  }

  const assistant = value.assistant;
  const intent = value.intent;
  const features = value.features;

  if (!isRecord(assistant)) {
    throw new Error("Config assistant section must be a JSON object.");
  }

  if (typeof assistant.name !== "string" || assistant.name.length === 0) {
    throw new Error("Config assistant.name must be a non-empty string.");
  }

  if (
    !Array.isArray(assistant.wakePhrases) ||
    !assistant.wakePhrases.every((wakePhrase) => typeof wakePhrase === "string")
  ) {
    throw new Error("Config assistant.wakePhrases must be a string array.");
  }

  if (!isRecord(features)) {
    throw new Error("Config features section must be a JSON object.");
  }

  if (!isRecord(intent)) {
    throw new Error("Config intent section must be a JSON object.");
  }

  if (typeof intent.provider !== "string" || intent.provider.length === 0) {
    throw new Error("Config intent.provider must be a non-empty string.");
  }

  const parsedVoice = parseVoiceConfig(value.voice);

  return {
    assistant: {
      name: assistant.name,
      wakePhrases: assistant.wakePhrases,
    },
    conversation: parseConversationConfig(value.conversation),
    responseRewriter: parseResponseRewriterConfig(value.responseRewriter),
    ...parseDesktopVoiceConfig(
      value.desktopVoice,
      parsedVoice.voice,
      options.desktopVoiceProviderAdapterRegistry ??
        createDesktopVoiceProviderAdapterRegistry(),
    ),
    ...parsedVoice,
    intent: parseIntentConfig(
      intent,
      options.intentProviderRegistry ?? createDefaultIntentProviderRegistry(),
    ),
    features: parseFeaturesConfig(
      features,
      options.featureAdapterRegistry ?? createDefaultFeatureAdapterRegistry(),
    ),
  };
}
