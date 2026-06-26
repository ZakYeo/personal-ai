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
import {
  requireDesktopVoiceConfig,
  requireVoiceConfig,
} from "../config/config.js";
import { selectConfiguredVoiceAdapter } from "./voice-adapter-selection.js";

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
  const voice = requireVoiceConfig(config);
  const desktopVoice = requireDesktopVoiceConfig(config);

  return {
    audioInput: selectConfiguredVoiceAdapter(
      voice,
      "input",
      desktopVoiceAdapterRegistry.input,
    )(desktopVoice.audioInput),
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
    )(desktopVoice.textToSpeech),
    wakeWord: selectConfiguredVoiceAdapter(
      voice,
      "wakeWord",
      desktopVoiceAdapterRegistry.wakeWord,
    )(),
  };
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
