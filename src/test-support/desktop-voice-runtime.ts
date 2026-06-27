import type { VoiceCommandConfig } from "../ports/assistant.js";
import type { LoadedRuntimeConfig } from "../runtimes/config/config.js";
import { enabledDeterministicConfig } from "./deterministic-runtime-fixtures.js";
import {
  createFailingCommandScript,
  createShellCommand,
} from "./adapter-contract.js";

export function createDesktopVoiceCommand(
  script: string,
  ...args: string[]
): VoiceCommandConfig {
  return createShellCommand(script, ...args);
}

export function createDesktopVoiceConfig(
  transcript: string,
  overrides: Partial<LoadedRuntimeConfig> = {},
): LoadedRuntimeConfig {
  const baseConfig: LoadedRuntimeConfig = {
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
  config: LoadedRuntimeConfig,
): LoadedRuntimeConfig {
  const desktopVoice = { ...config.desktopVoice };
  delete desktopVoice.speechToText;

  return {
    ...config,
    desktopVoice,
  };
}

export function withoutDesktopAudioInput(
  config: LoadedRuntimeConfig,
): LoadedRuntimeConfig {
  const desktopVoice = { ...config.desktopVoice };
  delete desktopVoice.audioInput;

  return {
    ...config,
    desktopVoice,
  };
}

export function withDesktopSpeechToTextFailure(
  config: LoadedRuntimeConfig,
  stderrText: string,
  exitCode: number,
): LoadedRuntimeConfig {
  return {
    ...config,
    desktopVoice: {
      ...config.desktopVoice,
      speechToText: createDesktopVoiceCommand(
        createFailingCommandScript(stderrText, exitCode),
      ),
    },
  };
}
