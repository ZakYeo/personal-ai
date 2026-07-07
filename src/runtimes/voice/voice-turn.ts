import type { Assistant } from "../../core/assistant/index.js";
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
import { runDetectedVoiceCommand } from "./voice-command.js";
import { logWakeDetected, logWakeListening } from "./voice-progress.js";
import { speakResponse } from "./voice-response.js";
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
  try {
    logWakeListening(io, dependencies.turnConfig.wakePhrases);

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

    logWakeDetected(io);

    return await runDetectedVoiceCommand(
      dependencies,
      transcript.text,
      io,
      detection.phrase ? { wakePhrase: detection.phrase } : {},
    );
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
