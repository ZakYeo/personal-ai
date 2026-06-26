import { createMockVoiceRuntime, runVoiceTurn } from "./mock-voice-runtime.js";
import {
  deterministicScenarios,
  enabledDeterministicConfig,
  mockVoiceConfig,
  runtimeFailureResponse,
  voiceEnabledDeterministicConfig,
} from "../../test-support/deterministic-scenarios.js";
import {
  createCapturedWriter,
  createThrowingAssistant,
  createVoiceRuntimeDependencies,
} from "../../test-support/voice-runtime.js";

describe("mock voice runtime", () => {
  it("runs a simulated voice command through the assistant core", async () => {
    const runtime = await createMockVoiceRuntime({
      config: voiceEnabledDeterministicConfig,
      utterance: deterministicScenarios.calendarWedding.text,
    });

    await expect(runtime.runOnce()).resolves.toEqual({
      response: deterministicScenarios.calendarWedding.response,
      spokenText: deterministicScenarios.calendarWedding.response.text,
      status: "spoken",
      textOutputWritten: false,
      transcript: deterministicScenarios.calendarWedding.text,
      wakePhrase: "hey jarvis",
    });
  });

  it("ignores utterances without the wake phrase", async () => {
    const assistant = createThrowingAssistant();
    const dependencies = createVoiceRuntimeDependencies({
      assistant,
      utterance: "list my alarms",
    });

    await expect(runVoiceTurn(dependencies)).resolves.toEqual({
      response: {
        status: "unknown",
        text: "Wake phrase not detected.",
      },
      status: "ignored",
      textOutputWritten: false,
    });
  });

  it("speaks a graceful fallback if assistant handling rejects", async () => {
    const spoken = createCapturedWriter();
    const stderr = createCapturedWriter();
    const dependencies = createVoiceRuntimeDependencies({
      assistant: createThrowingAssistant(),
      output: spoken.writes,
      utterance: deterministicScenarios.alarmListEmpty.text,
    });

    await expect(
      runVoiceTurn(dependencies, {
        fallbackOutput: spoken,
        stderr,
      }),
    ).resolves.toMatchObject({
      response: runtimeFailureResponse,
      spokenText: runtimeFailureResponse.text,
      status: "spoken",
      textOutputWritten: false,
    });
    expect(spoken.writes).toEqual([`${runtimeFailureResponse.text}\n`]);
    expect(stderr.writes).toEqual(["Runtime failure: raw assistant failure\n"]);
  });

  it("falls back to text output when speech output fails", async () => {
    const fallbackOutput = createCapturedWriter();
    const stderr = createCapturedWriter();
    const dependencies = createVoiceRuntimeDependencies({
      audioOutputError: new Error("speaker unavailable"),
      utterance: deterministicScenarios.alarmListEmpty.text,
    });

    await expect(
      runVoiceTurn(dependencies, {
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
