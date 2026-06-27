import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type {
  AssistantConfig,
  VoiceCommandConfig,
} from "../../ports/assistant.js";

const defaultConfigPath = fileURLToPath(
  new URL("../../../config/default.json", import.meta.url),
);

interface LoadConfigOptions {
  configPath?: string;
}

export interface ResolvedVoiceConfig {
  audioOutput: string;
  input: string;
  speechToText: string;
  textToSpeech: string;
  wakeWord: string;
}

interface ResolvedDesktopVoiceConfig {
  audioInput: VoiceCommandConfig;
  audioOutput: VoiceCommandConfig;
  speechToText: VoiceCommandConfig;
  textToSpeech: VoiceCommandConfig;
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
    ...parseDesktopVoice(value.desktopVoice),
    ...parseVoice(value.voice),
    intent: parseIntent(intent),
    features: parseFeatures(features),
  };
}

export function requireVoiceConfig(
  config: AssistantConfig,
): ResolvedVoiceConfig {
  return {
    input: requireVoiceAdapterConfig(config, "input"),
    wakeWord: requireVoiceAdapterConfig(config, "wakeWord"),
    speechToText: requireVoiceAdapterConfig(config, "speechToText"),
    textToSpeech: requireVoiceAdapterConfig(config, "textToSpeech"),
    audioOutput: requireVoiceAdapterConfig(config, "audioOutput"),
  };
}

export function requireDesktopVoiceConfig(
  config: AssistantConfig,
): ResolvedDesktopVoiceConfig {
  return {
    audioInput: requireDesktopVoiceCommand(config, "audioInput"),
    audioOutput: requireDesktopVoiceCommand(config, "audioOutput"),
    speechToText: requireDesktopVoiceCommand(config, "speechToText"),
    textToSpeech: requireDesktopVoiceCommand(config, "textToSpeech"),
  };
}

function parseDesktopVoice(
  value: unknown,
): Pick<AssistantConfig, "desktopVoice"> {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error("Config desktopVoice section must be a JSON object.");
  }

  return {
    desktopVoice: {
      ...parseVoiceCommand("audioInput", value.audioInput),
      ...parseVoiceCommand("audioOutput", value.audioOutput),
      ...parseVoiceCommand("speechToText", value.speechToText),
      ...parseVoiceCommand("textToSpeech", value.textToSpeech),
    },
  };
}

function parseVoiceCommand<
  TKey extends keyof NonNullable<AssistantConfig["desktopVoice"]>,
>(
  key: TKey,
  value: unknown,
): Partial<Pick<NonNullable<AssistantConfig["desktopVoice"]>, TKey>> {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error(`Config desktopVoice.${key} must be a JSON object.`);
  }

  if (typeof value.command !== "string" || value.command.length === 0) {
    throw new Error(
      `Config desktopVoice.${key}.command must be a non-empty string.`,
    );
  }

  if (
    value.args !== undefined &&
    (!Array.isArray(value.args) ||
      !value.args.every((argument) => typeof argument === "string"))
  ) {
    throw new Error(`Config desktopVoice.${key}.args must be a string array.`);
  }

  const timeoutMs = value.timeoutMs;

  if (
    timeoutMs !== undefined &&
    (typeof timeoutMs !== "number" ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs <= 0)
  ) {
    throw new Error(
      `Config desktopVoice.${key}.timeoutMs must be a positive integer.`,
    );
  }

  return {
    [key]: {
      command: value.command,
      ...(value.args ? { args: value.args } : {}),
      ...(timeoutMs ? { timeoutMs } : {}),
    },
  } as Pick<NonNullable<AssistantConfig["desktopVoice"]>, TKey>;
}

function parseVoice(value: unknown): Pick<AssistantConfig, "voice"> {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error("Config voice section must be a JSON object.");
  }

  return {
    voice: {
      ...parseVoiceAdapter("input", value.input),
      ...parseVoiceAdapter("wakeWord", value.wakeWord),
      ...parseVoiceAdapter("speechToText", value.speechToText),
      ...parseVoiceAdapter("textToSpeech", value.textToSpeech),
      ...parseVoiceAdapter("audioOutput", value.audioOutput),
    },
  };
}

function parseIntent(
  intent: Record<string, unknown>,
): AssistantConfig["intent"] {
  return {
    provider: intent.provider as string,
    ...parseOpenAIIntentConfig(intent.provider as string, intent.openai),
  };
}

function parseOpenAIIntentConfig(
  provider: string,
  value: unknown,
): Pick<AssistantConfig["intent"], "openai"> {
  if (value === undefined) {
    if (provider === "openai") {
      throw new Error("Config intent.openai must be configured.");
    }

    return {};
  }

  if (!isRecord(value)) {
    throw new Error("Config intent.openai must be a JSON object.");
  }

  if (typeof value.model !== "string" || value.model.length === 0) {
    throw new Error("Config intent.openai.model must be a non-empty string.");
  }

  const apiKeyEnv = value.apiKeyEnv ?? "OPENAI_API_KEY";

  if (typeof apiKeyEnv !== "string" || apiKeyEnv.length === 0) {
    throw new Error(
      "Config intent.openai.apiKeyEnv must be a non-empty string.",
    );
  }

  const baseUrl = value.baseUrl ?? "https://api.openai.com/v1";

  if (typeof baseUrl !== "string" || baseUrl.length === 0) {
    throw new Error("Config intent.openai.baseUrl must be a non-empty string.");
  }

  const timeoutMs = value.timeoutMs ?? 30_000;

  if (
    typeof timeoutMs !== "number" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs <= 0
  ) {
    throw new Error(
      "Config intent.openai.timeoutMs must be a positive integer.",
    );
  }

  return {
    openai: {
      apiKeyEnv,
      baseUrl,
      model: value.model,
      timeoutMs,
    },
  };
}

function requireVoiceAdapterConfig(
  config: AssistantConfig,
  key: keyof ResolvedVoiceConfig,
): string {
  const adapterId = config.voice?.[key];

  if (adapterId === undefined) {
    throw new Error(`Config voice.${key} must be configured.`);
  }

  return adapterId;
}

function parseVoiceAdapter<
  TKey extends keyof NonNullable<AssistantConfig["voice"]>,
>(
  key: TKey,
  value: unknown,
): Partial<Pick<NonNullable<AssistantConfig["voice"]>, TKey>> {
  if (value === undefined) {
    return {};
  }

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Config voice.${key} must be a non-empty string.`);
  }

  return {
    [key]: value,
  } as Pick<NonNullable<AssistantConfig["voice"]>, TKey>;
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

function requireDesktopVoiceCommand(
  config: AssistantConfig,
  key: keyof ResolvedDesktopVoiceConfig,
): VoiceCommandConfig {
  const command = config.desktopVoice?.[key];

  if (!command) {
    throw new Error(`Config desktopVoice.${key} must be configured.`);
  }

  return command;
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
