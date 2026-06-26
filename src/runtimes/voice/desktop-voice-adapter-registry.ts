import {
  CommandSpeechToText,
  CommandTextToSpeech,
  SoxAudioInput,
  SoxAudioOutput,
  TextPrefixWakeWordDetector,
} from "../../adapters/desktop/desktop-voice-adapters.js";
import type {
  AssistantConfig,
  VoiceCommandConfig,
} from "../../ports/assistant.js";
import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  TextToSpeechPort,
  WakeWordPort,
} from "../../ports/voice.js";
import { selectConfiguredVoiceAdapter } from "./voice-adapter-selection.js";

type DesktopVoiceConfig = NonNullable<AssistantConfig["desktopVoice"]>;
type DesktopVoiceCommandKey = keyof DesktopVoiceConfig;

interface DesktopVoiceAdapters {
  audioInput: AudioInputPort;
  audioOutput: AudioOutputPort;
  speechToText: SpeechToTextPort;
  textToSpeech: TextToSpeechPort;
  wakeWord: WakeWordPort;
}

export function createDesktopVoiceAdapters(
  config: AssistantConfig,
): DesktopVoiceAdapters {
  return {
    audioInput: selectConfiguredVoiceAdapter(
      config,
      "input",
      desktopVoiceAdapterRegistry.input,
    )(getDesktopVoiceCommand(config, "audioInput")),
    audioOutput: selectConfiguredVoiceAdapter(
      config,
      "audioOutput",
      desktopVoiceAdapterRegistry.audioOutput,
    )(getDesktopVoiceCommand(config, "audioOutput")),
    speechToText: selectConfiguredVoiceAdapter(
      config,
      "speechToText",
      desktopVoiceAdapterRegistry.speechToText,
    )(getDesktopVoiceCommand(config, "speechToText")),
    textToSpeech: selectConfiguredVoiceAdapter(
      config,
      "textToSpeech",
      desktopVoiceAdapterRegistry.textToSpeech,
    )(getDesktopVoiceCommand(config, "textToSpeech")),
    wakeWord: selectConfiguredVoiceAdapter(
      config,
      "wakeWord",
      desktopVoiceAdapterRegistry.wakeWord,
    )(),
  };
}

function getDesktopVoiceCommand(
  config: AssistantConfig,
  key: DesktopVoiceCommandKey,
): VoiceCommandConfig {
  const command = config.desktopVoice?.[key];

  if (!command) {
    throw new Error(`Config desktopVoice.${key} must be configured.`);
  }

  return command;
}

const desktopVoiceAdapterRegistry = {
  input: {
    "sox-rec": (command: VoiceCommandConfig) => new SoxAudioInput(command),
  },
  wakeWord: {
    "text-prefix": () => new TextPrefixWakeWordDetector(),
  },
  speechToText: {
    command: (command: VoiceCommandConfig) => new CommandSpeechToText(command),
  },
  textToSpeech: {
    command: (command: VoiceCommandConfig) => new CommandTextToSpeech(command),
  },
  audioOutput: {
    "sox-play": (command: VoiceCommandConfig) => new SoxAudioOutput(command),
  },
} satisfies {
  input: Record<string, (command: VoiceCommandConfig) => AudioInputPort>;
  wakeWord: Record<string, () => WakeWordPort>;
  speechToText: Record<
    string,
    (command: VoiceCommandConfig) => SpeechToTextPort
  >;
  textToSpeech: Record<
    string,
    (command: VoiceCommandConfig) => TextToSpeechPort
  >;
  audioOutput: Record<string, (command: VoiceCommandConfig) => AudioOutputPort>;
};
