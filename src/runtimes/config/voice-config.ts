import type { LoadedRuntimeConfig } from "./config.js";

export interface ResolvedVoiceConfig {
  audioOutput: string;
  input: string;
  speechToText: string;
  textToSpeech: string;
  wakeWord: string;
}

export function requireVoiceConfig(
  config: LoadedRuntimeConfig,
): ResolvedVoiceConfig {
  return {
    input: requireVoiceAdapterConfig(config, "input"),
    wakeWord: requireVoiceAdapterConfig(config, "wakeWord"),
    speechToText: requireVoiceAdapterConfig(config, "speechToText"),
    textToSpeech: requireVoiceAdapterConfig(config, "textToSpeech"),
    audioOutput: requireVoiceAdapterConfig(config, "audioOutput"),
  };
}

function requireVoiceAdapterConfig(
  config: LoadedRuntimeConfig,
  key: keyof ResolvedVoiceConfig,
): string {
  const adapterId = config.voice?.[key];

  if (adapterId === undefined) {
    throw new Error(`Config voice.${key} must be configured.`);
  }

  return adapterId;
}
