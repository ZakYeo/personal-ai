import { runVoiceBenchmark } from "./benchmark-runner.js";

describe("voice benchmark runner", () => {
  it("excludes one warm-up and records three STT repetitions per sample", async () => {
    const calls: string[] = [];

    const result = await runVoiceBenchmark(
      {
        corpusSha256: "a".repeat(64),
        device: createDevice(),
        startedAt: "2026-07-15T10:00:00.000Z",
        sttCandidates: ["whisper-base-en"],
        sttInputs: [
          {
            audioDurationMs: 1_500,
            expectedText: "List my alarms",
            filePath: "personal/list.wav",
            id: "alarm-list-v1",
            kind: "personal",
            speechEndMs: 1_000,
          },
        ],
        ttsCandidates: [],
        ttsInputs: [],
      },
      {
        executeStt: ({ measured, repetition }) => {
          calls.push(`${measured ? "measure" : "warmup"}:${repetition}`);
          return Promise.resolve({
            cpuMs: 300,
            finalizationMs: 400,
            peakRssBytes: 40_000_000,
            realTimeFactor: 0.2,
            shutdownMs: 20,
            startupMs: 100,
            transcript: "List my alarms.",
          });
        },
        executeTts: () => Promise.reject(new Error("Unexpected TTS call.")),
      },
    );

    expect(calls).toEqual(["warmup:0", "measure:1", "measure:2", "measure:3"]);
    expect(result.candidates[0]?.samples[0]).toMatchObject({
      audioDurationMs: 1_500,
      exactMatch: true,
      expectedText: "List my alarms",
      repetitions: [{ ok: true }, { ok: true }, { ok: true }],
      speechEndMs: 1_000,
      wordErrorRate: 0,
    });
  });

  it("passes private TTS text as data and records first-audio telemetry", async () => {
    const texts: string[] = [];

    const result = await runVoiceBenchmark(
      {
        corpusSha256: "b".repeat(64),
        device: createDevice(),
        startedAt: "2026-07-15T10:00:00.000Z",
        sttCandidates: [],
        sttInputs: [],
        ttsCandidates: ["piper-alba-medium"],
        ttsInputs: [
          {
            expectedFacts: ["11am", "Friday the 17th"],
            id: "calendar-facts-v1",
            text: "Your appointment is at 11am this Friday the 17th.",
          },
        ],
      },
      {
        executeStt: () => Promise.reject(new Error("Unexpected STT call.")),
        executeTts: ({ text }) => {
          texts.push(text);
          return Promise.resolve({
            audioDurationMs: 2_000,
            audioSha256: "c".repeat(64),
            cpuMs: 200,
            firstAudioMs: 250,
            peakRssBytes: 30_000_000,
            realTimeFactor: 0.1,
            shutdownMs: 10,
            startupMs: 80,
          });
        },
      },
    );

    expect(texts).toHaveLength(4);
    expect(texts.every((text) => text.includes("11am"))).toBe(true);
    expect(result.candidates[0]?.samples[0]).toMatchObject({
      expectedFacts: ["11am", "Friday the 17th"],
      repetitions: [
        { firstAudioMs: 250, ok: true },
        { ok: true },
        { ok: true },
      ],
    });
  });

  it("records a diagnostic failure and continues later repetitions", async () => {
    let calls = 0;
    const result = await runVoiceBenchmark(
      {
        corpusSha256: "d".repeat(64),
        device: createDevice(),
        startedAt: "2026-07-15T10:00:00.000Z",
        sttCandidates: ["sherpa-streaming-zipformer"],
        sttInputs: [
          {
            audioDurationMs: 1_500,
            expectedText: "List my alarms",
            filePath: "personal/list.wav",
            id: "alarm-list-v1",
            kind: "personal",
            speechEndMs: 1_000,
          },
        ],
        ttsCandidates: [],
        ttsInputs: [],
      },
      {
        executeStt: ({ measured }) => {
          calls += 1;
          return measured && calls === 2
            ? Promise.reject(new Error("process timed out after SIGKILL"))
            : Promise.resolve({
                cpuMs: 300,
                finalizationMs: 400,
                peakRssBytes: 40_000_000,
                realTimeFactor: 0.2,
                shutdownMs: 20,
                startupMs: 100,
                transcript: "List my alarms",
              });
        },
        executeTts: () => Promise.reject(new Error("Unexpected TTS call.")),
      },
    );

    expect(result.candidates[0]?.samples[0]?.repetitions).toEqual([
      {
        diagnostic: "process timed out after SIGKILL",
        errorCategory: "execution",
        ok: false,
      },
      expect.objectContaining({ ok: true }),
      expect.objectContaining({ ok: true }),
    ]);
  });
});

function createDevice() {
  return {
    architecture: "aarch64",
    cpu: "Raspberry Pi 5",
    deviceId: "pi5" as const,
    kernel: "Linux 6.12",
    memoryBytes: 8_000_000_000,
    os: "Raspberry Pi OS 64-bit",
  };
}
