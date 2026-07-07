import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { runtimeFailureResponse } from "../../test-support/deterministic-runtime-fixtures.js";
import { line } from "../../test-support/primitives.js";
import {
  createCapturedWriter,
  createThrowingAssistant,
  createVoiceActivationDependencies,
} from "../../test-support/voice-runtime.js";
import { runVoiceActivation } from "./voice-activation.js";

type VoiceActivationTestDependencies = ReturnType<
  typeof createVoiceActivationDependencies
>;

interface ActivationFailureScenario {
  configure(
    dependencies: VoiceActivationTestDependencies,
  ): VoiceActivationTestDependencies;
  message: string;
  name: string;
}

const preWakeFailureScenarios: ActivationFailureScenario[] = [
  {
    name: "wake audio capture",
    configure: (dependencies) => ({
      ...dependencies,
      wakeAudioInput: {
        capture: () => Promise.reject(new Error("wake microphone unavailable")),
      },
    }),
    message: "wake microphone unavailable",
  },
  {
    name: "wake speech-to-text",
    configure: (dependencies) => ({
      ...dependencies,
      speechToText: {
        transcribe: () => Promise.reject(new Error("wake stt unavailable")),
      },
    }),
    message: "wake stt unavailable",
  },
];

const postWakeFailureScenarios: ActivationFailureScenario[] = [
  {
    name: "command audio capture",
    configure: (dependencies) => ({
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
    configure: (dependencies) => {
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
];

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

  it("uses local wake activation without transcribing wake audio", async () => {
    const progressOutput = createCapturedWriter();
    const wakeActivations: string[][] = [];
    const dependencies = createVoiceActivationDependencies({
      commandUtterance: deterministicScenarios.alarmListEmpty.text,
      wakeUtterance: "background conversation",
    });

    await expect(
      runVoiceActivation(
        {
          ...dependencies,
          wakeActivation: {
            waitForWake: (request) => {
              wakeActivations.push(request.wakePhrases);

              return Promise.resolve({ phrase: "hey jarvis" });
            },
          },
          wakeAudioInput: {
            capture: () =>
              Promise.reject(new Error("wake audio should not be captured")),
          },
        },
        { progressOutput },
      ),
    ).resolves.toMatchObject({
      response: deterministicScenarios.alarmListEmpty.response,
      transcript: deterministicScenarios.alarmListEmpty.text,
      wakePhrase: "hey jarvis",
    });

    expect(wakeActivations).toEqual([["hey jarvis"]]);
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

  it("streams speech output when streaming adapters are available", async () => {
    const streamedAudio: string[] = [];
    const batchSpeechTexts: string[] = [];
    const dependencies = createVoiceActivationDependencies({
      wakeUtterance: "Hey Jarvis",
    });

    await expect(
      runVoiceActivation({
        ...dependencies,
        streamingAudioOutput: {
          playStream: async (chunks) => {
            streamedAudio.push(await readChunksAsText(chunks));
          },
        },
        streamingTextToSpeech: {
          synthesizeStream: (text) =>
            Promise.resolve({
              chunks: chunksFromText(`stream:${text}`),
              text,
            }),
        },
        textToSpeech: {
          synthesize: (text) => {
            batchSpeechTexts.push(text);

            return Promise.resolve({ text });
          },
        },
      }),
    ).resolves.toMatchObject({
      response: deterministicScenarios.alarmListEmpty.response,
      spokenText: deterministicScenarios.alarmListEmpty.response.text,
      status: "spoken",
    });

    expect(streamedAudio).toEqual([
      `stream:${deterministicScenarios.alarmListEmpty.response.text}`,
    ]);
    expect(batchSpeechTexts).toEqual([]);
  });

  it("streams command transcription after wake detection", async () => {
    const progressOutput = createCapturedWriter();
    const capturedBatchAudio: string[] = [];
    const dependencies = createVoiceActivationDependencies({
      wakeUtterance: "Hey Jarvis",
    });

    await expect(
      runVoiceActivation(
        {
          ...dependencies,
          commandAudioInput: {
            capture: () => {
              capturedBatchAudio.push("batch");

              return Promise.resolve({ text: "batch command" });
            },
          },
          streamingAudioInput: {
            captureStream: () =>
              Promise.resolve({ chunks: chunksFromText("audio") }),
          },
          streamingSpeechToText: {
            transcribeStream: async (_audio, events) => {
              await Promise.resolve();
              events?.onTranscriptDelta?.("list ");
              events?.onTranscriptDelta?.("alarms");

              return { text: deterministicScenarios.alarmListEmpty.text };
            },
          },
        },
        { progressOutput },
      ),
    ).resolves.toMatchObject({
      response: deterministicScenarios.alarmListEmpty.response,
      transcript: deterministicScenarios.alarmListEmpty.text,
    });

    expect(capturedBatchAudio).toEqual([]);
    expect(progressOutput.writes).toContain("list ");
    expect(progressOutput.writes).toContain("alarms");
  });

  it.each(preWakeFailureScenarios)(
    "lets pre-wake $name failures reach the service boundary",
    async (scenario) => {
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
    },
  );

  it.each(postWakeFailureScenarios)(
    "speaks a graceful fallback after post-wake $name failure",
    async (scenario) => {
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
      ).resolves.toEqual({
        response: runtimeFailureResponse,
        spokenText: runtimeFailureResponse.text,
        status: "spoken",
        textOutputWritten: false,
        wakePhrase: "hey jarvis",
      });
      expect(fallbackOutput.writes).toEqual([]);
      expect(stderr.writes).toEqual([
        line(`Runtime failure: ${scenario.message}`),
      ]);
    },
  );
});

async function* chunksFromText(text: string): AsyncIterable<Uint8Array> {
  await Promise.resolve();
  yield Buffer.from(text, "utf8");
}

async function readChunksAsText(
  chunks: AsyncIterable<Uint8Array>,
): Promise<string> {
  const buffers: Buffer[] = [];

  for await (const chunk of chunks) {
    buffers.push(Buffer.from(chunk));
  }

  return Buffer.concat(buffers).toString("utf8");
}
