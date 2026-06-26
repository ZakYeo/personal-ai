import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { AssistantConfig } from "../../ports/assistant.js";

const defaultConfigPath = fileURLToPath(
  new URL("../../../config/default.json", import.meta.url),
);

interface LoadConfigOptions {
  configPath?: string;
}

export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<AssistantConfig> {
  const configPath = options.configPath ?? defaultConfigPath;
  const rawConfig = await readFile(configPath, "utf8");

  return parseAssistantConfig(JSON.parse(rawConfig));
}

export function parseAssistantConfig(value: unknown): AssistantConfig {
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

  return {
    assistant: {
      name: assistant.name,
      wakePhrases: assistant.wakePhrases,
    },
    intent: {
      provider: intent.provider,
    },
    features: parseFeatures(features),
  };
}

function parseFeatures(
  value: Record<string, unknown>,
): AssistantConfig["features"] {
  const features: AssistantConfig["features"] = {};

  for (const [featureId, featureConfig] of Object.entries(value)) {
    if (!isRecord(featureConfig)) {
      throw new Error(`Config feature "${featureId}" must be a JSON object.`);
    }

    if (typeof featureConfig.enabled !== "boolean") {
      throw new Error(
        `Config feature "${featureId}".enabled must be a boolean.`,
      );
    }

    features[featureId] = {
      enabled: featureConfig.enabled,
      ...parseFeatureAdapter(featureId, featureConfig),
      ...parseConfirmationRequiredCapabilities(featureId, featureConfig),
    };
  }

  return features;
}

function parseFeatureAdapter(
  featureId: string,
  featureConfig: Record<string, unknown>,
): Pick<AssistantConfig["features"][string], "adapter"> {
  const value = featureConfig.adapter;

  if (value === undefined) {
    return {};
  }

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Config feature "${featureId}".adapter must be a non-empty string.`,
    );
  }

  return {
    adapter: value,
  };
}

function parseConfirmationRequiredCapabilities(
  featureId: string,
  featureConfig: Record<string, unknown>,
): Pick<
  AssistantConfig["features"][string],
  "confirmationRequiredCapabilities"
> {
  const value = featureConfig.confirmationRequiredCapabilities;

  if (value === undefined) {
    return {};
  }

  if (
    !Array.isArray(value) ||
    !value.every((capability) => typeof capability === "string")
  ) {
    throw new Error(
      `Config feature "${featureId}".confirmationRequiredCapabilities must be a string array.`,
    );
  }

  return {
    confirmationRequiredCapabilities: value,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
