import {
  MockAudioInput,
  MockAudioOutput,
  MockSpeechToText,
  MockTextToSpeech,
  MockWakeWordDetector,
} from "../../adapters/mock/mock-voice-adapters.js";
import type { AssistantConfig } from "../../ports/assistant.js";
import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  TextToSpeechPort,
  WakeWordPort,
} from "../../ports/voice.js";

type VoiceConfig = NonNullable<AssistantConfig["voice"]>;
type VoiceAdapterKey = keyof VoiceConfig;

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
  config: AssistantConfig,
  options: MockVoiceAdapterRegistryOptions,
): MockVoiceAdapters {
  return {
    audioInput: createVoiceAdapter(
      config,
      "input",
      mockVoiceAdapterRegistry.input,
    )(options),
    audioOutput: createVoiceAdapter(
      config,
      "audioOutput",
      mockVoiceAdapterRegistry.audioOutput,
    )(),
    speechToText: createVoiceAdapter(
      config,
      "speechToText",
      mockVoiceAdapterRegistry.speechToText,
    )(),
    textToSpeech: createVoiceAdapter(
      config,
      "textToSpeech",
      mockVoiceAdapterRegistry.textToSpeech,
    )(),
    wakeWord: createVoiceAdapter(
      config,
      "wakeWord",
      mockVoiceAdapterRegistry.wakeWord,
    )(),
  };
}

function createVoiceAdapter<TAdapter, TOptions extends unknown[]>(
  config: AssistantConfig,
  key: VoiceAdapterKey,
  registry: Record<string, (...options: TOptions) => TAdapter>,
): (...options: TOptions) => TAdapter {
  const adapterId = config.voice?.[key];

  if (adapterId === undefined) {
    throw new Error(`Config voice.${key} must be configured.`);
  }

  const createAdapter = registry[adapterId];

  if (!createAdapter) {
    throw new Error(`Config voice.${key} "${adapterId}" is not registered.`);
  }

  return createAdapter;
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
