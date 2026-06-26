import type {
  AssistantConfig,
  VoiceCommandConfig,
} from "../ports/assistant.js";
import { enabledDeterministicConfig } from "./deterministic-runtime-fixtures.js";

export function createDesktopVoiceCommand(
  script: string,
  ...args: string[]
): VoiceCommandConfig {
  return {
    args: ["-c", script, "sh", ...args],
    command: "/bin/sh",
  };
}

export function createDesktopVoiceConfig(
  transcript: string,
  overrides: Partial<AssistantConfig> = {},
): AssistantConfig {
  const baseConfig: AssistantConfig = {
    ...enabledDeterministicConfig,
    desktopVoice: {
      audioInput: createDesktopVoiceCommand('printf audio > "$1"', "{output}"),
      audioOutput: createDesktopVoiceCommand(""),
      speechToText: createDesktopVoiceCommand(
        `printf '%s' ${JSON.stringify(transcript)}`,
      ),
      textToSpeech: createDesktopVoiceCommand(
        'printf \'%s\' "$1" > "$2"',
        "{text}",
        "{output}",
      ),
    },
    voice: {
      audioOutput: "sox-play",
      input: "sox-rec",
      speechToText: "command",
      textToSpeech: "command",
      wakeWord: "text-prefix",
    },
  };

  return {
    ...baseConfig,
    ...overrides,
    assistant: overrides.assistant ?? baseConfig.assistant,
    desktopVoice: {
      ...baseConfig.desktopVoice,
      ...overrides.desktopVoice,
    },
    features: overrides.features ?? baseConfig.features,
    intent: overrides.intent ?? baseConfig.intent,
    voice: {
      ...baseConfig.voice,
      ...overrides.voice,
    },
  };
}

export function withoutDesktopSpeechToText(
  config: AssistantConfig,
): AssistantConfig {
  const desktopVoice = { ...config.desktopVoice };
  delete desktopVoice.speechToText;

  return {
    ...config,
    desktopVoice,
  };
}

export function withoutDesktopAudioInput(
  config: AssistantConfig,
): AssistantConfig {
  const desktopVoice = { ...config.desktopVoice };
  delete desktopVoice.audioInput;

  return {
    ...config,
    desktopVoice,
  };
}

export function withDesktopSpeechToTextFailure(
  config: AssistantConfig,
  stderrText: string,
  exitCode: number,
): AssistantConfig {
  return {
    ...config,
    desktopVoice: {
      ...config.desktopVoice,
      speechToText: createDesktopVoiceCommand(
        `printf '%s' ${JSON.stringify(stderrText)} >&2; exit ${exitCode}`,
      ),
    },
  };
}
