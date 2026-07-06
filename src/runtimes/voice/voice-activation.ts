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
import type {
  VoiceRuntimeIo,
  VoiceTurnConfig,
  VoiceTurnResult,
} from "./voice-turn.js";
import { handleAssistantText, speakResponse } from "./voice-response.js";
import type { Assistant } from "../../core/assistant/index.js";

export interface VoiceActivationDependencies {
  assistant: Assistant;
  audioOutput: AudioOutputPort;
  commandAudioInput: AudioInputPort;
  speechToText: SpeechToTextPort;
  textToSpeech: TextToSpeechPort;
  turnConfig: VoiceTurnConfig;
  wakeAudioInput: AudioInputPort;
  wakeWord: WakeWordPort;
}

export async function runVoiceActivation(
  dependencies: VoiceActivationDependencies,
  io: VoiceRuntimeIo = {},
): Promise<VoiceTurnResult> {
  try {
    const wakeAudio = await dependencies.wakeAudioInput.capture();
    const wakeTranscript =
      await dependencies.speechToText.transcribe(wakeAudio);
    const detection = await dependencies.wakeWord.detect({
      audio: {
        ...wakeAudio,
        text: wakeTranscript.text,
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
        transcript: wakeTranscript.text,
      };
    }

    const commandAudio = await dependencies.commandAudioInput.capture();
    const commandTranscript =
      await dependencies.speechToText.transcribe(commandAudio);
    const response = await handleAssistantText(
      dependencies.assistant,
      commandTranscript.text,
      io,
    );
    const speechOutput = await speakResponse(dependencies, response, io);

    return {
      response,
      ...speechOutput,
      transcript: commandTranscript.text,
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
