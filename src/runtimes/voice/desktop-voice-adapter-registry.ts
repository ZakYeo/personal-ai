import {
  CommandSpeechToText,
  CommandTextToSpeech,
  CommandWakeActivation,
  SoxAudioInput,
  SoxAudioOutput,
  TextPrefixWakeWordDetector,
} from "../../adapters/desktop/desktop-voice-adapters.js";
import type { VoiceCommandConfig } from "../../ports/assistant.js";
import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  TextToSpeechPort,
  VoiceTempFilePort,
  WakeActivationPort,
  WakeWordPort,
} from "../../ports/voice.js";
import type {
  ResolvedDesktopVoiceConfig,
  ResolvedDesktopVoiceServiceConfig,
} from "../config/desktop-voice-config.js";
import type { ResolvedVoiceConfig } from "../config/voice-config.js";
import { selectConfiguredVoiceAdapter } from "./voice-adapter-selection.js";
import { createNodeVoiceTempFiles } from "./voice-temp-files.js";

export interface DesktopVoiceAdapters {
  audioInput: AudioInputPort;
  audioOutput: AudioOutputPort;
  speechToText: SpeechToTextPort;
  textToSpeech: TextToSpeechPort;
  wakeActivation?: WakeActivationPort;
  wakeWord: WakeWordPort;
  cleanup?(): Promise<void>;
}

export interface DesktopVoiceServiceAdapters extends DesktopVoiceAdapters {
  wakeAudioInput: AudioInputPort;
}

export function createDesktopVoiceAdapters(
  voice: ResolvedVoiceConfig,
  desktopVoice: ResolvedDesktopVoiceConfig,
): DesktopVoiceAdapters {
  const tempFiles = createNodeVoiceTempFiles();

  return {
    audioInput: selectConfiguredVoiceAdapter(
      voice,
      "input",
      desktopVoiceAdapterRegistry.input,
    )(desktopVoice.audioInput, tempFiles),
    audioOutput: selectConfiguredVoiceAdapter(
      voice,
      "audioOutput",
      desktopVoiceAdapterRegistry.audioOutput,
    )(desktopVoice.audioOutput),
    speechToText: selectConfiguredVoiceAdapter(
      voice,
      "speechToText",
      desktopVoiceAdapterRegistry.speechToText,
    )(desktopVoice.speechToText),
    textToSpeech: selectConfiguredVoiceAdapter(
      voice,
      "textToSpeech",
      desktopVoiceAdapterRegistry.textToSpeech,
    )(desktopVoice.textToSpeech, tempFiles),
    ...(voice.wakeActivation
      ? {
          wakeActivation: selectConfiguredVoiceAdapter(
            voice,
            "wakeActivation",
            desktopVoiceAdapterRegistry.wakeActivation,
          )(requireDesktopWakeActivationConfig(desktopVoice)),
        }
      : {}),
    wakeWord: selectConfiguredVoiceAdapter(
      voice,
      "wakeWord",
      desktopVoiceAdapterRegistry.wakeWord,
    )(),
    cleanup: () => tempFiles.cleanup(),
  };
}

export function createDesktopVoiceServiceAdapters(
  voice: ResolvedVoiceConfig,
  desktopVoice: ResolvedDesktopVoiceServiceConfig,
): DesktopVoiceServiceAdapters {
  const adapters = createDesktopVoiceAdapters(voice, desktopVoice);
  const tempFiles = createNodeVoiceTempFiles();

  return {
    ...adapters,
    wakeAudioInput: selectConfiguredVoiceAdapter(
      voice,
      "input",
      desktopVoiceAdapterRegistry.input,
    )(desktopVoice.wakeAudioInput, tempFiles),
    cleanup: async () => {
      await Promise.all([adapters.cleanup?.(), tempFiles.cleanup()]);
    },
  };
}

const desktopVoiceAdapterRegistry = {
  input: {
    "sox-rec": (command: VoiceCommandConfig, tempFiles: VoiceTempFilePort) =>
      new SoxAudioInput(command, tempFiles),
  },
  wakeWord: {
    "text-prefix": () => new TextPrefixWakeWordDetector(),
  },
  wakeActivation: {
    "openwakeword-command": (command: VoiceCommandConfig) =>
      new CommandWakeActivation(command),
  },
  speechToText: {
    command: (command: VoiceCommandConfig) => new CommandSpeechToText(command),
  },
  textToSpeech: {
    command: (command: VoiceCommandConfig, tempFiles: VoiceTempFilePort) =>
      new CommandTextToSpeech(command, tempFiles),
  },
  audioOutput: {
    "sox-play": (command: VoiceCommandConfig) => new SoxAudioOutput(command),
  },
} satisfies {
  input: Record<
    string,
    (
      command: VoiceCommandConfig,
      tempFiles: VoiceTempFilePort,
    ) => AudioInputPort
  >;
  wakeWord: Record<string, () => WakeWordPort>;
  wakeActivation: Record<
    string,
    (command: VoiceCommandConfig) => WakeActivationPort
  >;
  speechToText: Record<
    string,
    (command: VoiceCommandConfig) => SpeechToTextPort
  >;
  textToSpeech: Record<
    string,
    (
      command: VoiceCommandConfig,
      tempFiles: VoiceTempFilePort,
    ) => TextToSpeechPort
  >;
  audioOutput: Record<string, (command: VoiceCommandConfig) => AudioOutputPort>;
};

function requireDesktopWakeActivationConfig(
  desktopVoice: ResolvedDesktopVoiceConfig,
): VoiceCommandConfig {
  if (!desktopVoice.wakeActivation) {
    throw new Error("Config desktopVoice.wakeActivation must be configured.");
  }

  return desktopVoice.wakeActivation;
}
