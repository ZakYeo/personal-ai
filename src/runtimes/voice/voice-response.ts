import { playVoiceSpeech } from "./play-voice-speech.js";
import type { AssistantResponse } from "../../ports/assistant.js";
import type { AudioOutputPort, TextToSpeechPort } from "../../ports/voice.js";
import { logRuntimeFailure } from "../human-boundary.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";
import type { StreamingVoiceOutput } from "./streaming-voice.js";
import {
  VoiceOutputCancelledError,
  type VoiceOutputCoordinator,
} from "./voice-output-coordinator.js";

interface VoiceSpeechDependencies {
  audioOutput: AudioOutputPort;
  outputCoordinator?: VoiceOutputCoordinator;
  shutdownSignal?: AbortSignal;
  onFirstAudioSubmitted?(this: void): void;
  streamingOutput?: StreamingVoiceOutput;
  textToSpeech: TextToSpeechPort;
}

interface VoiceSpeechOutputResult {
  spokenText?: string;
  status: "fallback_output" | "spoken" | "cancelled";
  textOutputWritten: boolean;
}

export async function speakResponse(
  dependencies: VoiceSpeechDependencies,
  response: AssistantResponse,
  io: VoiceRuntimeIo,
): Promise<VoiceSpeechOutputResult> {
  const speak = (signal?: AbortSignal) =>
    speakResponseSession(dependencies, response, signal);
  try {
    return dependencies.outputCoordinator
      ? await dependencies.outputCoordinator.run(
          speak,
          dependencies.shutdownSignal
            ? { signal: dependencies.shutdownSignal }
            : {},
        )
      : await speak(dependencies.shutdownSignal);
  } catch (error) {
    if (
      error instanceof VoiceOutputCancelledError ||
      dependencies.shutdownSignal?.aborted
    )
      return { status: "cancelled", textOutputWritten: false };
    logRuntimeFailure(error, io);
    io.fallbackOutput?.write(`${response.text}\n`);
    return {
      status: "fallback_output",
      textOutputWritten: Boolean(io.fallbackOutput),
    };
  }
}

async function speakResponseSession(
  dependencies: VoiceSpeechDependencies,
  response: AssistantResponse,
  signal?: AbortSignal,
): Promise<VoiceSpeechOutputResult> {
  const spokenText = await playVoiceSpeech(dependencies, response.text, {
    ...(signal ? { signal } : {}),
    ...(dependencies.onFirstAudioSubmitted
      ? { onFirstAudioSubmitted: dependencies.onFirstAudioSubmitted }
      : {}),
  });
  return { spokenText, status: "spoken", textOutputWritten: false };
}
