import type { Assistant } from "../../core/assistant/index.js";
import type { AssistantResponse } from "../../ports/assistant.js";
import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  TextToSpeechPort,
  WakeWordPort,
} from "../../ports/voice.js";
import {
  logFeatureDiagnostics,
  logRuntimeFailure,
  safeRuntimeFallbackResponse,
} from "../human-boundary.js";

export interface VoiceRuntimeIo {
  fallbackOutput?: { write(chunk: string): boolean | void };
  stderr?: { write(chunk: string): boolean | void };
}

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

export interface VoiceTurnResult {
  response: AssistantResponse;
  spokenText?: string;
  status: "spoken" | "ignored" | "fallback_output";
  textOutputWritten: boolean;
  transcript?: string;
  wakePhrase?: string;
}

type VoiceSpeechOutputResult = Pick<
  VoiceTurnResult,
  "spokenText" | "status" | "textOutputWritten"
>;

export async function runVoiceTurn(
  dependencies: VoiceRuntimeDependencies,
  io: VoiceRuntimeIo = {},
): Promise<VoiceTurnResult> {
  try {
    const audio = await dependencies.audioInput.capture();
    const transcript = await dependencies.speechToText.transcribe(audio);
    const detection = await dependencies.wakeWord.detect({
      audio: {
        ...audio,
        text: transcript.text,
      },
      wakePhrases: dependencies.turnConfig.wakePhrases,
    });

    if (!detection.detected) {
      return {
        response: {
          status: "unknown",
          text: "Wake phrase not detected.",
        },
        status: "ignored",
        textOutputWritten: false,
      };
    }

    const response = await handleAssistantText(
      dependencies.assistant,
      transcript.text,
      io,
    );
    const speechOutput = await speakResponse(dependencies, response, io);

    return {
      response,
      ...speechOutput,
      transcript: transcript.text,
      ...(detection.phrase ? { wakePhrase: detection.phrase } : {}),
    };
  } catch (error) {
    logRuntimeFailure(error, io);

    const speechOutput = await speakResponse(
      dependencies,
      safeRuntimeFallbackResponse,
      io,
    );

    return {
      response: safeRuntimeFallbackResponse,
      ...speechOutput,
    };
  }
}

async function handleAssistantText(
  assistant: Assistant,
  text: string,
  io: VoiceRuntimeIo,
): Promise<AssistantResponse> {
  try {
    const outcome = await assistant.handleTextWithDiagnostics(text);

    logFeatureDiagnostics(outcome.diagnostics ?? [], io);

    return outcome.response;
  } catch (error) {
    logRuntimeFailure(error, io);

    return safeRuntimeFallbackResponse;
  }
}

async function speakResponse(
  dependencies: VoiceRuntimeDependencies,
  response: AssistantResponse,
  io: VoiceRuntimeIo,
): Promise<VoiceSpeechOutputResult> {
  try {
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
