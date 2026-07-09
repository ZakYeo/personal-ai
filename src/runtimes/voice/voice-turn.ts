import type { Assistant } from "../../core/assistant/index.js";
import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  TextToSpeechPort,
  WakeWordPort,
} from "../../ports/voice.js";
import { runVoicePipeline } from "./voice-pipeline.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";
import type { VoiceTurnResult } from "./voice-turn-result.js";

export type { VoiceRuntimeIo } from "./voice-runtime-io.js";
export type { VoiceTurnResult } from "./voice-turn-result.js";

export interface VoiceTurnConfig {
  wakePhrases: string[];
}

export interface VoiceRuntimeDependencies {
  assistant: Assistant;
  audioInput: AudioInputPort;
  audioOutput: AudioOutputPort;
  speechToText: SpeechToTextPort;
  textToSpeech: TextToSpeechPort;
  turnConfig: VoiceTurnConfig;
  wakeWord: WakeWordPort;
}

export async function runVoiceTurn(
  dependencies: VoiceRuntimeDependencies,
  io: VoiceRuntimeIo = {},
): Promise<VoiceTurnResult> {
  const result = await runVoicePipeline(
    {
      assistant: dependencies.assistant,
      audioOutput: dependencies.audioOutput,
      commandAudioInput: dependencies.audioInput,
      speechToText: dependencies.speechToText,
      textToSpeech: dependencies.textToSpeech,
      turnConfig: {
        initialCommandSource: "wake-transcript",
        preWakeFailureMode: "fallback",
        wakePhrases: dependencies.turnConfig.wakePhrases,
      },
      wakeAudioInput: dependencies.audioInput,
      wakeWord: dependencies.wakeWord,
    },
    io,
  );

  if (result.status === "ignored") {
    return {
      response: result.response,
      status: result.status,
      textOutputWritten: result.textOutputWritten,
      ...(result.timings ? { timings: result.timings } : {}),
    };
  }

  return result;
}
