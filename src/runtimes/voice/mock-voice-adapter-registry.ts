import {
  MockAudioInput,
  MockAudioOutput,
  MockSpeechToText,
  MockTextToSpeech,
  MockWakeWordDetector,
} from "../../adapters/mock/mock-voice-adapters.js";
import type { ResolvedVoiceConfig } from "../config/config.js";
import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  TextToSpeechPort,
  WakeWordPort,
} from "../../ports/voice.js";
import { selectConfiguredVoiceAdapter } from "./voice-adapter-selection.js";

interface MockVoiceAdapterRegistryOptions {
  utterance: string;
}

interface MockVoiceAdapters {
  audioInput: AudioInputPort;
  audioOutput: AudioOutputPort;
  speechToText: SpeechToTextPort;
  textToSpeech: TextToSpeechPort;
  wakeWord: WakeWordPort;
}

export function createMockVoiceAdapters(
  voice: ResolvedVoiceConfig,
  options: MockVoiceAdapterRegistryOptions,
): MockVoiceAdapters {
  return {
    audioInput: selectConfiguredVoiceAdapter(
      voice,
      "input",
      mockVoiceAdapterRegistry.input,
    )(options),
    audioOutput: selectConfiguredVoiceAdapter(
      voice,
      "audioOutput",
      mockVoiceAdapterRegistry.audioOutput,
    )(),
    speechToText: selectConfiguredVoiceAdapter(
      voice,
      "speechToText",
      mockVoiceAdapterRegistry.speechToText,
    )(),
    textToSpeech: selectConfiguredVoiceAdapter(
      voice,
      "textToSpeech",
      mockVoiceAdapterRegistry.textToSpeech,
    )(),
    wakeWord: selectConfiguredVoiceAdapter(
      voice,
      "wakeWord",
      mockVoiceAdapterRegistry.wakeWord,
    )(),
  };
}

const mockVoiceAdapterRegistry = {
  input: {
    mock: (options: MockVoiceAdapterRegistryOptions) =>
      new MockAudioInput(options.utterance),
  },
  wakeWord: {
    mock: () => new MockWakeWordDetector(),
  },
  speechToText: {
    mock: () => new MockSpeechToText(),
  },
  textToSpeech: {
    mock: () => new MockTextToSpeech(),
  },
  audioOutput: {
    mock: () => new MockAudioOutput(),
  },
} satisfies {
  input: Record<
    string,
    (options: MockVoiceAdapterRegistryOptions) => AudioInputPort
  >;
  wakeWord: Record<string, () => WakeWordPort>;
  speechToText: Record<string, () => SpeechToTextPort>;
  textToSpeech: Record<string, () => TextToSpeechPort>;
  audioOutput: Record<string, () => AudioOutputPort>;
};
