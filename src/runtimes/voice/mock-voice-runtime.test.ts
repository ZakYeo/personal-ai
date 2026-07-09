import { createMockVoiceRuntime } from "./mock-voice-runtime.js";
import { runVoiceTurn } from "./voice-turn.js";
import { jsonResponse } from "../../test-support/adapter-contract.js";
import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import {
  enabledDeterministicConfig,
  mockVoiceConfig,
  runtimeFailureResponse,
  voiceEnabledDeterministicConfig,
} from "../../test-support/deterministic-runtime-fixtures.js";
import {
  createCapturedWriter,
  createThrowingAssistant,
  createVoiceRuntimeDependencies,
} from "../../test-support/voice-runtime.js";
import {
  createRuntimeConfigWithOpenAIIntentProvider,
  withVoiceAdapterId,
} from "../../test-support/runtime-composition.js";
import { line } from "../../test-support/primitives.js";

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

  it("passes provider dependencies into composed text assistant", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        output_text: JSON.stringify({
          kind: "command",
          command: {
            capability: "alarm.list",
            parameters: [],
            rawText: deterministicScenarios.alarmListEmpty.text,
          },
          response: null,
        }),
      }),
    );
    const runtime = await createMockVoiceRuntime({
      config: {
        ...createRuntimeConfigWithOpenAIIntentProvider(),
        voice: mockVoiceConfig,
      },
      env: { OPENAI_API_KEY: "test-api-key" },
      fetch,
      utterance: deterministicScenarios.alarmListEmpty.text,
    });

    await expect(runtime.runOnce()).resolves.toMatchObject({
      response: deterministicScenarios.alarmListEmpty.response,
      status: "spoken",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.test/v1/responses",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("speaks general conversation responses after wake activation", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        output_text: JSON.stringify({
          command: null,
          kind: "conversation",
          response: null,
        }),
      }),
    );
    const utterance = "Hey Jarvis, how are you today?";
    const config = createRuntimeConfigWithOpenAIIntentProvider();
    const runtime = await createMockVoiceRuntime({
      config: {
        ...config,
        conversation: {
          history: config.conversation.history,
          provider: "deterministic",
        },
        voice: mockVoiceConfig,
      },
      env: { OPENAI_API_KEY: "test-api-key" },
      fetch,
      utterance,
    });

    await expect(runtime.runOnce()).resolves.toMatchObject({
      response: {
        status: "ok",
        text: `I can chat about "${utterance}".`,
      },
      spokenText: `I can chat about "${utterance}".`,
      status: "spoken",
      transcript: utterance,
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

  it("uses narrow voice turn wake phrase config", async () => {
    const progressOutput = createCapturedWriter();
    const dependencies = createVoiceRuntimeDependencies({
      utterance: "Computer, list my alarms",
      wakePhrases: ["computer"],
    });

    await expect(
      runVoiceTurn(dependencies, { progressOutput }),
    ).resolves.toMatchObject({
      response: deterministicScenarios.alarmListEmpty.response,
      transcript: "Computer, list my alarms",
      wakePhrase: "computer",
    });
    expect(progressOutput.writes).toEqual([
      line('Now listening for wake word "computer".'),
      line("Wake word detected, now listening..."),
      line("Heard: Computer, list my alarms"),
      line(`Assistant: ${deterministicScenarios.alarmListEmpty.response.text}`),
    ]);
  });

  it("captures a requested follow-up utterance without another wake phrase", async () => {
    const progressOutput = createCapturedWriter();
    const handledTexts: string[] = [];
    const utterances = [
      "Hey Jarvis, how are you today?",
      "What are your capable functionalities?",
    ];
    const responses = [
      {
        expectsFollowUp: true,
        status: "ok" as const,
        text: "I am doing well. How can I help you today?",
      },
      deterministicScenarios.capabilityList.response,
    ];
    const dependencies = createVoiceRuntimeDependencies({
      assistant: {
        handleText: () =>
          Promise.reject(new Error("handleText should not be called")),
        handleTextWithDiagnostics: (text) => {
          handledTexts.push(text);

          const response = responses.shift();

          if (!response) {
            return Promise.reject(new Error("Unexpected assistant turn."));
          }

          return Promise.resolve({ response });
        },
      },
    });

    await expect(
      runVoiceTurn(
        {
          ...dependencies,
          audioInput: {
            capture: () => {
              const utterance = utterances.shift();

              if (!utterance) {
                return Promise.reject(new Error("Unexpected audio capture."));
              }

              return Promise.resolve({ text: utterance });
            },
          },
        },
        { progressOutput },
      ),
    ).resolves.toMatchObject({
      response: deterministicScenarios.capabilityList.response,
      transcript: "What are your capable functionalities?",
      wakePhrase: "hey jarvis",
    });
    expect(handledTexts).toEqual([
      "Hey Jarvis, how are you today?",
      "What are your capable functionalities?",
    ]);
    expect(progressOutput.writes).toEqual([
      line('Now listening for wake word "hey jarvis".'),
      line("Wake word detected, now listening..."),
      line("Heard: Hey Jarvis, how are you today?"),
      line("Assistant: I am doing well. How can I help you today?"),
      line("Listening for your reply..."),
      line("Heard: What are your capable functionalities?"),
      line(`Assistant: ${deterministicScenarios.capabilityList.response.text}`),
    ]);
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
        config: withVoiceAdapterId("speechToText", "unknown", {
          ...enabledDeterministicConfig,
          voice: mockVoiceConfig,
        }),
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
