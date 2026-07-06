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
  logRuntimeFailure,
  safeRuntimeFallbackResponse,
} from "../human-boundary.js";
import { handleAssistantText, speakResponse } from "./voice-response.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";

export type { VoiceRuntimeIo } from "./voice-runtime-io.js";

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
