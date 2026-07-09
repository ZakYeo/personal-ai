import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  StreamingAudioInputPort,
  StreamingAudioOutputPort,
  StreamingSpeechToTextPort,
  StreamingTextToSpeechPort,
  TextToSpeechPort,
  WakeActivationPort,
  WakeWordPort,
} from "../../ports/voice.js";
import type { Assistant } from "../../core/assistant/index.js";
import {
  runVoicePipeline,
  type VoicePipelineResult,
} from "./voice-pipeline.js";
import type { VoiceTimingOptions } from "./voice-timings.js";
import type { VoiceRuntimeIo, VoiceTurnConfig } from "./voice-turn.js";

export interface VoiceActivationDependencies {
  assistant: Assistant;
  audioOutput: AudioOutputPort;
  commandAudioInput: AudioInputPort;
  speechToText: SpeechToTextPort;
  streamingAudioInput?: StreamingAudioInputPort;
  streamingAudioOutput?: StreamingAudioOutputPort;
  streamingSpeechToText?: StreamingSpeechToTextPort;
  streamingTextToSpeech?: StreamingTextToSpeechPort;
  textToSpeech: TextToSpeechPort;
  timing?: VoiceTimingOptions;
  turnConfig: VoiceTurnConfig;
  wakeActivation?: WakeActivationPort;
  wakeAudioInput: AudioInputPort;
  wakeWord: WakeWordPort;
}

export type VoiceActivationResult = VoicePipelineResult;

export function runVoiceActivation(
  dependencies: VoiceActivationDependencies,
  io: VoiceRuntimeIo = {},
): Promise<VoiceActivationResult> {
  return runVoicePipeline(
    {
      ...dependencies,
      turnConfig: {
        initialCommandSource: "command-capture",
        preWakeFailureMode: "throw",
        wakePhrases: dependencies.turnConfig.wakePhrases,
      },
    },
    io,
  );
}
