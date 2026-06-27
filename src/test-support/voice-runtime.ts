import type { Assistant } from "../core/assistant/index.js";
import type { VoiceRuntimeDependencies } from "../runtimes/voice/voice-turn.js";
import { deterministicScenarios } from "./deterministic-scenarios.js";
import { voiceEnabledDeterministicConfig } from "./deterministic-runtime-fixtures.js";

export { createCapturedWriter } from "./primitives.js";

export const deterministicVoiceUtterance =
  deterministicScenarios.alarmListEmpty.text;

export function createThrowingAssistant(
  message = "raw assistant failure",
): Assistant {
  return {
    handleText: () => Promise.reject(new Error(message)),
    handleTextWithDiagnostics: () => Promise.reject(new Error(message)),
  };
}

export function createVoiceRuntimeDependencies(
  options: Partial<{
    assistant: Assistant;
    audioOutputError: Error;
    output: string[];
    utterance: string;
    wakePhrases: string[];
  }> = {},
): VoiceRuntimeDependencies {
  return {
    assistant:
      options.assistant ??
      ({
        handleText: () =>
          Promise.resolve(deterministicScenarios.alarmListEmpty.response),
        handleTextWithDiagnostics: () =>
          Promise.resolve({
            response: deterministicScenarios.alarmListEmpty.response,
          }),
      } satisfies Assistant),
    audioInput: {
      capture: () =>
        Promise.resolve({
          text: options.utterance ?? deterministicVoiceUtterance,
        }),
    },
    audioOutput: {
      play: (speech) => {
        if (options.audioOutputError) {
          return Promise.reject(options.audioOutputError);
        }

        options.output?.push(`${speech.text}\n`);
        return Promise.resolve();
      },
    },
    speechToText: {
      transcribe: (audio) => Promise.resolve({ text: audio.text }),
    },
    turnConfig: {
      wakePhrases:
        options.wakePhrases ??
        voiceEnabledDeterministicConfig.assistant.wakePhrases,
    },
    textToSpeech: {
      synthesize: (text) => Promise.resolve({ text }),
    },
    wakeWord: {
      detect: ({ audio, wakePhrases }) => {
        const phrase = wakePhrases[0] ?? "";

        if (!audio.text.toLowerCase().startsWith(phrase)) {
          return Promise.resolve({ detected: false });
        }

        return Promise.resolve({ detected: true, phrase });
      },
    },
  };
}
