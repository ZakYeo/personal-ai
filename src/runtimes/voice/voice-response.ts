import type { Assistant } from "../../core/assistant/index.js";
import type { AssistantResponse } from "../../ports/assistant.js";
import type { AudioOutputPort, TextToSpeechPort } from "../../ports/voice.js";
import {
  logAssistantDiagnostics,
  logRuntimeFailure,
  safeRuntimeFallbackResponse,
} from "../human-boundary.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";
import type { StreamingVoiceOutput } from "./streaming-voice.js";
import type { VoiceOutputCoordinator } from "./voice-output-coordinator.js";

interface VoiceSpeechDependencies {
  audioOutput: AudioOutputPort;
  outputCoordinator?: VoiceOutputCoordinator;
  streamingOutput?: StreamingVoiceOutput;
  textToSpeech: TextToSpeechPort;
}

interface VoiceSpeechOutputResult {
  spokenText?: string;
  status: "fallback_output" | "spoken";
  textOutputWritten: boolean;
}

export async function handleAssistantText(
  assistant: Assistant,
  text: string,
  io: VoiceRuntimeIo,
): Promise<AssistantResponse> {
  try {
    const outcome = await assistant.handleTextWithDiagnostics(text);

    logAssistantDiagnostics(outcome.diagnostics ?? [], io);

    return outcome.response;
  } catch (error) {
    logRuntimeFailure(error, io);

    return safeRuntimeFallbackResponse;
  }
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
      await audioOutput.playStream(speech.chunks);

      return {
        spokenText: speech.text,
        status: "spoken",
        textOutputWritten: false,
      };
    }

    const speech = await dependencies.textToSpeech.synthesize(response.text);
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
