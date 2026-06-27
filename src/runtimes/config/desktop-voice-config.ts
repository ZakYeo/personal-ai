import type { VoiceCommandConfig } from "../../ports/assistant.js";
import type { LoadedRuntimeConfig } from "./config.js";

export interface ResolvedDesktopVoiceConfig {
  audioInput: VoiceCommandConfig;
  audioOutput: VoiceCommandConfig;
  speechToText: VoiceCommandConfig;
  textToSpeech: VoiceCommandConfig;
}

export function requireDesktopVoiceConfig(
  config: LoadedRuntimeConfig,
): ResolvedDesktopVoiceConfig {
  return {
    audioInput: requireDesktopVoiceCommand(config, "audioInput"),
    audioOutput: requireDesktopVoiceCommand(config, "audioOutput"),
    speechToText: requireDesktopVoiceCommand(config, "speechToText"),
    textToSpeech: requireDesktopVoiceCommand(config, "textToSpeech"),
  };
}

function requireDesktopVoiceCommand(
  config: LoadedRuntimeConfig,
  key: keyof ResolvedDesktopVoiceConfig,
): VoiceCommandConfig {
  const command = config.desktopVoice?.[key];

  if (!command) {
    throw new Error(`Config desktopVoice.${key} must be configured.`);
  }

  return command;
}
