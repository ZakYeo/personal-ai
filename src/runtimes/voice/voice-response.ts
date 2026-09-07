import type { AssistantResponse } from "../../ports/assistant.js";
import type { AudioOutputPort, TextToSpeechPort } from "../../ports/voice.js";
import { logRuntimeFailure } from "../human-boundary.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";
import type { StreamingVoiceOutput } from "./streaming-voice.js";
import type { VoiceOutputCoordinator } from "./voice-output-coordinator.js";

interface VoiceSpeechDependencies {
  audioOutput: AudioOutputPort;
  outputCoordinator?: VoiceOutputCoordinator;
  onFirstAudioSubmitted?(this: void): void;
  streamingOutput?: StreamingVoiceOutput;
  textToSpeech: TextToSpeechPort;
}

interface VoiceSpeechOutputResult {
  spokenText?: string;
  status: "fallback_output" | "spoken";
  textOutputWritten: boolean;
}

export async function speakResponse(
  dependencies: VoiceSpeechDependencies,
  response: AssistantResponse,
  io: VoiceRuntimeIo,
): Promise<VoiceSpeechOutputResult> {
  const speak = () => speakResponseSession(dependencies, response, io);
  return dependencies.outputCoordinator
    ? dependencies.outputCoordinator.run(speak)
    : speak();
}

async function speakResponseSession(
  dependencies: VoiceSpeechDependencies,
  response: AssistantResponse,
  io: VoiceRuntimeIo,
): Promise<VoiceSpeechOutputResult> {
  try {
    if (dependencies.streamingOutput) {
      const { audioOutput, textToSpeech } = dependencies.streamingOutput;
      const speech = await textToSpeech.synthesizeStream(response.text);
      await audioOutput.playStream(
        markFirstChunk(speech.chunks, dependencies.onFirstAudioSubmitted),
      );

      return {
        spokenText: speech.text,
        status: "spoken",
        textOutputWritten: false,
      };
    }

    const speech = await dependencies.textToSpeech.synthesize(response.text);
    dependencies.onFirstAudioSubmitted?.();
    await dependencies.audioOutput.play(speech);

    return {
      spokenText: speech.text,
      status: "spoken",
      textOutputWritten: false,
    };
  } catch (error) {
    logRuntimeFailure(error, io);
    io.fallbackOutput?.write(`${response.text}\n`);

    return {
      status: "fallback_output",
      textOutputWritten: Boolean(io.fallbackOutput),
    };
  }
}

async function* markFirstChunk(
  chunks: AsyncIterable<Uint8Array>,
  onFirst?: () => void,
): AsyncIterable<Uint8Array> {
  let submitted = false;
  for await (const chunk of chunks) {
    if (chunk.byteLength && !submitted) {
      submitted = true;
      onFirst?.();
    }
    yield chunk;
  }
}
