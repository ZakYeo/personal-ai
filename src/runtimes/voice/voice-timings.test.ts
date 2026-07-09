import {
  createVoiceTurnInstrumentation,
  createVoiceTimingRecorder,
  formatVoiceTimings,
} from "./voice-timings.js";

describe("voice timings", () => {
  it("records measured phase durations and total elapsed time", async () => {
    const now = createScriptedClock([100, 110, 145, 150, 180, 205]);
    const recorder = createVoiceTimingRecorder(now);

    await expect(
      recorder.measure("wake activation", () => Promise.resolve("detected")),
    ).resolves.toBe("detected");
    await expect(
      recorder.measure("assistant", () => Promise.resolve("handled")),
    ).resolves.toBe("handled");

    expect(recorder.snapshot()).toEqual({
      phases: [
        { durationMs: 35, name: "wake activation" },
        { durationMs: 30, name: "assistant" },
      ],
      totalMs: 105,
    });
  });

  it("records failed measured phases before rethrowing", async () => {
    const now = createScriptedClock([0, 10, 25]);
    const recorder = createVoiceTimingRecorder(now);

    await expect(
      recorder.measure("command transcription", () =>
        Promise.reject(new Error("provider failed")),
      ),
    ).rejects.toThrow("provider failed");

    expect(recorder.snapshot()).toEqual({
      phases: [{ durationMs: 15, name: "command transcription" }],
      totalMs: 25,
    });
  });

  it("formats a compact timing summary", () => {
    expect(
      formatVoiceTimings({
        phases: [
          { durationMs: 42, name: "wake activation" },
          { durationMs: 103, name: "assistant" },
        ],
        totalMs: 200,
      }),
    ).toEqual([
      "Voice timing summary:",
      "- wake activation: 42ms",
      "- assistant: 103ms",
      "- total: 200ms",
    ]);
  });

  it("provides no-op instrumentation when timing is disabled", async () => {
    const instrumentation = createVoiceTurnInstrumentation();

    await expect(
      instrumentation.measure("assistant handling", () =>
        Promise.resolve("handled"),
      ),
    ).resolves.toBe("handled");

    expect(instrumentation.snapshotIfEnabled()).toBeUndefined();
  });

  it("provides measured instrumentation when timing is enabled", async () => {
    const instrumentation = createVoiceTurnInstrumentation({
      nowMs: createScriptedClock([0, 10, 30, 35]),
    });

    await instrumentation.measure("speech output", () => Promise.resolve());

    expect(instrumentation.snapshotIfEnabled()).toEqual({
      phases: [{ durationMs: 20, name: "speech output" }],
      totalMs: 35,
    });
  });
});

function createScriptedClock(values: number[]): () => number {
  let index = 0;

  return () => {
    const value = values[index] ?? values.at(-1);
    index += 1;

    if (value === undefined) {
      throw new Error("Scripted clock requires at least one value.");
    }

    return value;
  };
}
