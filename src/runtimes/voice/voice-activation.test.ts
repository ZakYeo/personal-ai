import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { runtimeFailureResponse } from "../../test-support/deterministic-runtime-fixtures.js";
import { line } from "../../test-support/primitives.js";
import {
  createCapturedWriter,
  createThrowingAssistant,
  createVoiceActivationDependencies,
} from "../../test-support/voice-runtime.js";
import { runVoiceActivation } from "./voice-activation.js";

describe("voice activation", () => {
  it("ignores wake audio without the wake phrase", async () => {
    const commandCaptures: string[] = [];
    const progressOutput = createCapturedWriter();
    const dependencies = createVoiceActivationDependencies({
      assistant: createThrowingAssistant(),
      commandCaptures,
      wakeUtterance: "background conversation",
    });

    await expect(
      runVoiceActivation(dependencies, { progressOutput }),
    ).resolves.toEqual({
      response: {
        status: "unknown",
        text: "Wake phrase not detected.",
      },
      status: "ignored",
      textOutputWritten: false,
      transcript: "background conversation",
    });
    expect(commandCaptures).toEqual([]);
    expect(progressOutput.writes).toEqual([
      line('Now listening for wake word "hey jarvis".'),
    ]);
  });

  it("captures a separate command utterance after wake detection", async () => {
    const handledTexts: string[] = [];
    const progressOutput = createCapturedWriter();
    const dependencies = createVoiceActivationDependencies({
      commandUtterance: deterministicScenarios.alarmListEmpty.text,
      handledTexts,
      wakeUtterance: "Hey Jarvis",
    });

    await expect(
      runVoiceActivation(dependencies, { progressOutput }),
    ).resolves.toEqual({
      response: deterministicScenarios.alarmListEmpty.response,
      spokenText: deterministicScenarios.alarmListEmpty.response.text,
      status: "spoken",
      textOutputWritten: false,
      transcript: deterministicScenarios.alarmListEmpty.text,
      wakePhrase: "hey jarvis",
    });
    expect(handledTexts).toEqual([deterministicScenarios.alarmListEmpty.text]);
    expect(progressOutput.writes).toEqual([
      line('Now listening for wake word "hey jarvis".'),
      line("Wake word detected, now listening..."),
      line(`Heard: ${deterministicScenarios.alarmListEmpty.text}`),
      line(`Assistant: ${deterministicScenarios.alarmListEmpty.response.text}`),
    ]);
  });

  it("speaks a graceful fallback if assistant handling rejects", async () => {
    const spoken = createCapturedWriter();
    const stderr = createCapturedWriter();
    const dependencies = createVoiceActivationDependencies({
      assistant: createThrowingAssistant(),
      output: spoken.writes,
      wakeUtterance: "Hey Jarvis",
    });

    const result = await runVoiceActivation(dependencies, {
      fallbackOutput: spoken,
      stderr,
    });

    expect(result.response).toEqual(runtimeFailureResponse);
    expect(result.spokenText).toBe(runtimeFailureResponse.text);
    expect(result.status).toBe("spoken");
    expect(result.textOutputWritten).toBe(false);
    expect(spoken.writes).toEqual([`${runtimeFailureResponse.text}\n`]);
    expect(stderr.writes).toEqual(["Runtime failure: raw assistant failure\n"]);
  });

  it("falls back to text output when speech output fails", async () => {
    const fallbackOutput = createCapturedWriter();
    const stderr = createCapturedWriter();
    const dependencies = createVoiceActivationDependencies({
      audioOutputError: new Error("speaker unavailable"),
      wakeUtterance: "Hey Jarvis",
    });

    await expect(
      runVoiceActivation(dependencies, {
        fallbackOutput,
        stderr,
      }),
    ).resolves.toMatchObject({
      response: deterministicScenarios.alarmListEmpty.response,
      status: "fallback_output",
      textOutputWritten: true,
    });
    expect(fallbackOutput.writes).toEqual([
      `${deterministicScenarios.alarmListEmpty.response.text}\n`,
    ]);
    expect(stderr.writes).toEqual(["Runtime failure: speaker unavailable\n"]);
  });

  it.each([
    {
      name: "wake audio capture",
      configure: (
        dependencies: ReturnType<typeof createVoiceActivationDependencies>,
      ) => ({
        ...dependencies,
        wakeAudioInput: {
          capture: () =>
            Promise.reject(new Error("wake microphone unavailable")),
        },
      }),
      message: "wake microphone unavailable",
    },
    {
      name: "wake speech-to-text",
      configure: (
        dependencies: ReturnType<typeof createVoiceActivationDependencies>,
      ) => ({
        ...dependencies,
        speechToText: {
          transcribe: () => Promise.reject(new Error("wake stt unavailable")),
        },
      }),
      message: "wake stt unavailable",
    },
    {
      name: "command audio capture",
      configure: (
        dependencies: ReturnType<typeof createVoiceActivationDependencies>,
      ) => ({
        ...dependencies,
        commandAudioInput: {
          capture: () =>
            Promise.reject(new Error("command microphone unavailable")),
        },
      }),
      message: "command microphone unavailable",
    },
    {
      name: "command speech-to-text",
      configure: (
        dependencies: ReturnType<typeof createVoiceActivationDependencies>,
      ) => {
        let transcriptions = 0;

        return {
          ...dependencies,
          speechToText: {
            transcribe: (audio) => {
              transcriptions += 1;

              if (transcriptions === 2) {
                return Promise.reject(new Error("command stt unavailable"));
              }

              return Promise.resolve({ text: audio.text });
            },
          },
        };
      },
      message: "command stt unavailable",
    },
  ])("lets $name failures reach the service boundary", async (scenario) => {
    const fallbackOutput = createCapturedWriter();
    const stderr = createCapturedWriter();
    const dependencies = scenario.configure(
      createVoiceActivationDependencies({ wakeUtterance: "Hey Jarvis" }),
    );

    await expect(
      runVoiceActivation(dependencies, {
        fallbackOutput,
        stderr,
      }),
    ).rejects.toThrow(scenario.message);
    expect(fallbackOutput.writes).toEqual([]);
    expect(stderr.writes).toEqual([]);
  });
});
