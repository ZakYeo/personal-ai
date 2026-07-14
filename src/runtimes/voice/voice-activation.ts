import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
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
import type {
  StreamingVoiceInput,
  StreamingVoiceOutput,
} from "./streaming-voice.js";
import type { VoiceOutputCoordinator } from "./voice-output-coordinator.js";

export interface VoiceActivationDependencies {
  assistant: Assistant;
  audioOutput: AudioOutputPort;
  commandAudioInput: AudioInputPort;
  outputCoordinator?: VoiceOutputCoordinator;
  speechToText: SpeechToTextPort;
  streamingInput?: StreamingVoiceInput;
  streamingOutput?: StreamingVoiceOutput;
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
