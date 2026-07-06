import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { runtimeFailureResponse } from "../../test-support/deterministic-runtime-fixtures.js";
import {
  createCapturedWriter,
  createThrowingAssistant,
  createVoiceActivationDependencies,
} from "../../test-support/voice-runtime.js";
import { runVoiceActivation } from "./voice-activation.js";

describe("voice activation", () => {
  it("ignores wake audio without the wake phrase", async () => {
    const commandCaptures: string[] = [];
    const dependencies = createVoiceActivationDependencies({
      assistant: createThrowingAssistant(),
      commandCaptures,
      wakeUtterance: "background conversation",
    });

    await expect(runVoiceActivation(dependencies)).resolves.toEqual({
      response: {
        status: "unknown",
        text: "Wake phrase not detected.",
      },
      status: "ignored",
      textOutputWritten: false,
      transcript: "background conversation",
    });
    expect(commandCaptures).toEqual([]);
  });

  it("captures a separate command utterance after wake detection", async () => {
    const handledTexts: string[] = [];
    const dependencies = createVoiceActivationDependencies({
      commandUtterance: deterministicScenarios.alarmListEmpty.text,
      handledTexts,
      wakeUtterance: "Hey Jarvis",
    });

    await expect(runVoiceActivation(dependencies)).resolves.toEqual({
      response: deterministicScenarios.alarmListEmpty.response,
      spokenText: deterministicScenarios.alarmListEmpty.response.text,
      status: "spoken",
      textOutputWritten: false,
      transcript: deterministicScenarios.alarmListEmpty.text,
      wakePhrase: "hey jarvis",
    });
    expect(handledTexts).toEqual([deterministicScenarios.alarmListEmpty.text]);
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
});
