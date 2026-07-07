import type { VoiceCommandConfig } from "../../ports/assistant.js";
import { isRecord } from "./config-parse-utils.js";

export interface ParsedDesktopVoiceConfig {
  audioInput?: VoiceCommandConfig;
  audioOutput?: VoiceCommandConfig;
  speechToText?: VoiceCommandConfig;
  textToSpeech?: VoiceCommandConfig;
  wakeActivation?: VoiceCommandConfig;
  wakeAudioInput?: VoiceCommandConfig;
}

export interface ResolvedDesktopVoiceConfig {
  audioInput: VoiceCommandConfig;
  audioOutput: VoiceCommandConfig;
  speechToText: VoiceCommandConfig;
  textToSpeech: VoiceCommandConfig;
  wakeActivation?: VoiceCommandConfig;
  wakeAudioInput?: VoiceCommandConfig;
}

export interface ResolvedDesktopVoiceServiceConfig extends ResolvedDesktopVoiceConfig {
  wakeAudioInput: VoiceCommandConfig;
}

export function parseDesktopVoiceConfig(value: unknown): {
  desktopVoice?: ParsedDesktopVoiceConfig;
} {
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
      ...parseVoiceCommand("wakeActivation", value.wakeActivation),
      ...parseVoiceCommand("wakeAudioInput", value.wakeAudioInput),
    },
  };
}

export function requireDesktopVoiceConfig(config: {
  desktopVoice?: ParsedDesktopVoiceConfig;
}): ResolvedDesktopVoiceConfig {
  return {
    audioInput: requireDesktopVoiceCommand(config, "audioInput"),
    audioOutput: requireDesktopVoiceCommand(config, "audioOutput"),
    speechToText: requireDesktopVoiceCommand(config, "speechToText"),
    textToSpeech: requireDesktopVoiceCommand(config, "textToSpeech"),
    ...(config.desktopVoice?.wakeActivation
      ? { wakeActivation: config.desktopVoice.wakeActivation }
      : {}),
    ...(config.desktopVoice?.wakeAudioInput
      ? { wakeAudioInput: config.desktopVoice.wakeAudioInput }
      : {}),
  };
}

export function requireDesktopVoiceServiceConfig(config: {
  desktopVoice?: ParsedDesktopVoiceConfig;
}): ResolvedDesktopVoiceServiceConfig {
  return {
    ...requireDesktopVoiceConfig(config),
    wakeAudioInput: requireDesktopVoiceCommand(config, "wakeAudioInput"),
  };
}

function requireDesktopVoiceCommand(
  config: { desktopVoice?: ParsedDesktopVoiceConfig },
  key: keyof ResolvedDesktopVoiceConfig,
): VoiceCommandConfig {
  const command = config.desktopVoice?.[key];

  if (!command) {
    throw new Error(`Config desktopVoice.${key} must be configured.`);
  }

  return command;
}

function parseVoiceCommand<TKey extends keyof ParsedDesktopVoiceConfig>(
  key: TKey,
  value: unknown,
): Partial<Pick<ParsedDesktopVoiceConfig, TKey>> {
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
  } as Pick<ParsedDesktopVoiceConfig, TKey>;
}
