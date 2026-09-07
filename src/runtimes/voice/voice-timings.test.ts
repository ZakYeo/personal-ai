import {
  createVoiceTurnInstrumentation,
  createVoiceTimingRecorder,
  formatVoiceTimings,
} from "./voice-timings.js";

describe("voice timings", () => {
  it("emits bounded live clock observations without letting a failed observer affect the turn", async () => {
    let now = 100;
    const observed: unknown[] = [];
    const recorder = createVoiceTurnInstrumentation({
      nowMs: () => now,
      onEvent: (event) => {
        observed.push(event);
        expect(Object.isFrozen(event)).toBe(true);
        throw new Error("measurement output unavailable");
      },
    });
    now = 125;
    recorder.mark("wake_detected");
    recorder.mark("wake_detected");
    await expect(
      recorder.measure("command", () => Promise.resolve("done")),
    ).resolves.toBe("done");
    expect(observed).toEqual([
      {
        name: "wake_detected",
        offsetMs: 25,
        monotonicMs: 125,
        startedAtMs: 100,
      },
    ]);
    expect(recorder.snapshotIfEnabled()?.events).toEqual([
      { name: "wake_detected", offsetMs: 25 },
    ]);
  });
  it("retains first monotonic event offsets without mixing follow-up measurements", () => {
    let now = 100;
    const recorder = createVoiceTimingRecorder(() => now);
    recorder.mark("wake_detected");
    now = 120;
    recorder.mark("local_feedback");
    now = 300;
    recorder.mark("capture_completed");
    now = 320;
    recorder.mark("first_transcript");
    now = 500;
    recorder.mark("first_audio_submitted");
    const first = recorder.snapshot();
    now = 900;
    recorder.mark("capture_completed");
    expect(recorder.snapshot().events).toEqual(first.events);
    expect(first.events).toEqual([
      { name: "wake_detected", offsetMs: 0 },
      { name: "local_feedback", offsetMs: 20 },
      { name: "capture_completed", offsetMs: 200 },
      { name: "first_transcript", offsetMs: 220 },
      { name: "first_audio_submitted", offsetMs: 400 },
    ]);
    expect(formatVoiceTimings(first)).toContain(
      "- capture completion to first audio submission: 200ms (software boundary; acoustic onset unmeasured)",
    );
    expect(formatVoiceTimings(first)).toContain(
      "- detected wake to local feedback: 20ms",
    );
  });

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
