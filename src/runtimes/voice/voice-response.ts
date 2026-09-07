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
  signal?.throwIfAborted();
  const operation = signal ? { signal } : undefined;
  if (dependencies.streamingOutput) {
    const { audioOutput, textToSpeech } = dependencies.streamingOutput;
    const speech = await textToSpeech.synthesizeStream(
      response.text,
      operation,
    );
    signal?.throwIfAborted();
    await audioOutput.playStream(
      markFirstChunk(speech.chunks, dependencies.onFirstAudioSubmitted, signal),
      operation,
    );
    signal?.throwIfAborted();
    return {
      spokenText: speech.text,
      status: "spoken",
      textOutputWritten: false,
    };
  }
  const speech = await dependencies.textToSpeech.synthesize(
    response.text,
    operation,
  );
  signal?.throwIfAborted();
  dependencies.onFirstAudioSubmitted?.();
  await dependencies.audioOutput.play(speech, operation);
  signal?.throwIfAborted();
  return {
    spokenText: speech.text,
    status: "spoken",
    textOutputWritten: false,
  };
}

async function* markFirstChunk(
  chunks: AsyncIterable<Uint8Array>,
  onFirst?: () => void,
  signal?: AbortSignal,
): AsyncIterable<Uint8Array> {
  let submitted = false;
  for await (const chunk of chunks) {
    signal?.throwIfAborted();
    if (chunk.byteLength && !submitted) {
      submitted = true;
      onFirst?.();
    }
    yield chunk;
  }
}
