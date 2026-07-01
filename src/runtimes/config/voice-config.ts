import { isRecord } from "./config-parse-utils.js";

export interface ParsedVoiceConfig {
  audioOutput?: string;
  input?: string;
  speechToText?: string;
  textToSpeech?: string;
  wakeWord?: string;
}

export interface ResolvedVoiceConfig {
  audioOutput: string;
  input: string;
  speechToText: string;
  textToSpeech: string;
  wakeWord: string;
}

export function parseVoiceConfig(value: unknown): {
  voice?: ParsedVoiceConfig;
} {
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

export function requireVoiceConfig(config: {
  voice?: ParsedVoiceConfig;
}): ResolvedVoiceConfig {
  return {
    input: requireVoiceAdapterConfig(config, "input"),
    wakeWord: requireVoiceAdapterConfig(config, "wakeWord"),
    speechToText: requireVoiceAdapterConfig(config, "speechToText"),
    textToSpeech: requireVoiceAdapterConfig(config, "textToSpeech"),
    audioOutput: requireVoiceAdapterConfig(config, "audioOutput"),
  };
}

function requireVoiceAdapterConfig(
  config: { voice?: ParsedVoiceConfig },
  key: keyof ResolvedVoiceConfig,
): string {
  const adapterId = config.voice?.[key];

  if (adapterId === undefined) {
    throw new Error(`Config voice.${key} must be configured.`);
  }

  return adapterId;
}

function parseVoiceAdapter<TKey extends keyof ParsedVoiceConfig>(
  key: TKey,
  value: unknown,
): Partial<Pick<ParsedVoiceConfig, TKey>> {
  if (value === undefined) {
    return {};
  }

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Config voice.${key} must be a non-empty string.`);
  }

  return {
    [key]: value,
  } as Pick<ParsedVoiceConfig, TKey>;
}
