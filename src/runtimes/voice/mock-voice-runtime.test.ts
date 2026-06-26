import {
  createMockVoiceRuntime,
  runVoiceTurn,
  type VoiceRuntimeDependencies,
} from "./mock-voice-runtime.js";
import {
  deterministicScenarios,
  enabledDeterministicConfig,
  mockVoiceConfig,
  runtimeFailureResponse,
  voiceEnabledDeterministicConfig,
} from "../../test-support/deterministic-scenarios.js";
import type { Assistant } from "../../core/assistant/index.js";

describe("mock voice runtime", () => {
  it("runs a simulated voice command through the assistant core", async () => {
    const spoken: string[] = [];
    const runtime = await createMockVoiceRuntime({
      config: voiceEnabledDeterministicConfig,
      utterance: deterministicScenarios.calendarWedding.text,
      io: {
        fallbackOutput: {
          write: (chunk) => {
            spoken.push(chunk);
          },
        },
      },
    });

    await expect(runtime.runOnce()).resolves.toEqual({
      response: deterministicScenarios.calendarWedding.response,
      status: "spoken",
      transcript: deterministicScenarios.calendarWedding.text,
      wakePhrase: "hey jarvis",
    });
    expect(spoken).toEqual([
      `${deterministicScenarios.calendarWedding.response.text}\n`,
    ]);
  });

  it("ignores utterances without the wake phrase", async () => {
    const assistant = createThrowingAssistant();
    const dependencies = createVoiceDependencies({
      assistant,
      utterance: "list my alarms",
    });

    await expect(runVoiceTurn(dependencies)).resolves.toEqual({
      response: {
        status: "unknown",
        text: "Wake phrase not detected.",
      },
      status: "ignored",
    });
  });

  it("speaks a graceful fallback if assistant handling rejects", async () => {
    const spoken: string[] = [];
    const stderr: string[] = [];
    const dependencies = createVoiceDependencies({
      assistant: createThrowingAssistant(),
      output: spoken,
      utterance: deterministicScenarios.alarmListEmpty.text,
    });

    await expect(
      runVoiceTurn(dependencies, {
        fallbackOutput: createWriter(spoken),
        stderr: createWriter(stderr),
      }),
    ).resolves.toMatchObject({
      response: runtimeFailureResponse,
      status: "spoken",
    });
    expect(spoken).toEqual([`${runtimeFailureResponse.text}\n`]);
    expect(stderr).toEqual(["Runtime failure: raw assistant failure\n"]);
  });

  it("falls back to text output when speech output fails", async () => {
    const fallbackOutput: string[] = [];
    const stderr: string[] = [];
    const dependencies = createVoiceDependencies({
      audioOutputError: new Error("speaker unavailable"),
      utterance: deterministicScenarios.alarmListEmpty.text,
    });

    await expect(
      runVoiceTurn(dependencies, {
        fallbackOutput: createWriter(fallbackOutput),
        stderr: createWriter(stderr),
      }),
    ).resolves.toMatchObject({
      response: deterministicScenarios.alarmListEmpty.response,
      status: "fallback_output",
    });
    expect(fallbackOutput).toEqual([
      `${deterministicScenarios.alarmListEmpty.response.text}\n`,
    ]);
    expect(stderr).toEqual(["Runtime failure: speaker unavailable\n"]);
  });

  it("rejects unregistered voice adapters during composition", async () => {
    await expect(
      createMockVoiceRuntime({
        config: {
          ...enabledDeterministicConfig,
          voice: {
            ...mockVoiceConfig,
            speechToText: "unknown",
          },
        },
      }),
    ).rejects.toThrow('Config voice.speechToText "unknown" is not registered.');
  });

  it("rejects missing voice adapters during composition", async () => {
    await expect(
      createMockVoiceRuntime({
        config: enabledDeterministicConfig,
      }),
    ).rejects.toThrow("Config voice.input must be configured.");
  });
});

function createVoiceDependencies(
  options: Partial<{
    assistant: Assistant;
    audioOutputError: Error;
    output: string[];
    utterance: string;
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
          text: options.utterance ?? deterministicScenarios.alarmListEmpty.text,
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
    config: voiceEnabledDeterministicConfig,
    speechToText: {
      transcribe: (audio) => Promise.resolve({ text: audio.text }),
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

function createThrowingAssistant(): Assistant {
  return {
    handleText: () => Promise.reject(new Error("raw assistant failure")),
    handleTextWithDiagnostics: () =>
      Promise.reject(new Error("raw assistant failure")),
  };
}

function createWriter(writes: string[]): { write(chunk: string): void } {
  return {
    write: (chunk) => {
      writes.push(chunk);
    },
  };
}
