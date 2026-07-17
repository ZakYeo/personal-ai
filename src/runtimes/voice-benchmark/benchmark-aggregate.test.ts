import {
  aggregateBenchmarkChunks,
  type BenchmarkAggregationExpectation,
} from "./benchmark-aggregate.js";

describe("voice benchmark aggregation", () => {
  it("merges disjoint resumable samples and rejects duplicates", () => {
    const first = createChunk("alarm-list-v1");
    const second = createChunk("alarm-create-v1");
    expect(
      aggregateBenchmarkChunks(
        [first, second],
        expectation(["alarm-list-v1", "alarm-create-v1"]),
      ).candidates[0]?.samples,
    ).toHaveLength(2);
    expect(() =>
      aggregateBenchmarkChunks([first, first], expectation(["alarm-list-v1"])),
    ).toThrow(/duplicate/iu);
  });

  it("rejects mixed devices, missing samples, and invalid repetition counts", () => {
    const chunk = createChunk("alarm-list-v1");
    expect(() =>
      aggregateBenchmarkChunks(
        [
          chunk,
          { ...createChunk("alarm-create-v1"), device: { deviceId: "pi5" } },
        ],
        expectation(["alarm-list-v1", "alarm-create-v1"]),
      ),
    ).toThrow(/device/iu);
    expect(() =>
      aggregateBenchmarkChunks(
        [chunk],
        expectation(["alarm-list-v1", "alarm-create-v1"]),
      ),
    ).toThrow(/coverage/iu);
    const invalid = structuredClone(chunk);
    invalid.candidates[0]!.samples[0]!.repetitions.pop();
    expect(() =>
      aggregateBenchmarkChunks([invalid], expectation(["alarm-list-v1"])),
    ).toThrow(/repetitions/iu);
  });

  it("rejects complete chunks from stale benchmark inputs", () => {
    expect(() =>
      aggregateBenchmarkChunks([createChunk("alarm-list-v1")], {
        ...expectation(["alarm-list-v1"]),
        fingerprint: "b".repeat(64),
      }),
    ).toThrow(/fingerprint/iu);
  });
});

function expectation(sampleIds: string[]): BenchmarkAggregationExpectation {
  return {
    candidates: [{ candidateId: "whisper-base-en", kind: "stt", sampleIds }],
    deviceId: "desktop-wsl2",
    fingerprint: "a".repeat(64),
  };
}

function createChunk(id: string) {
  return {
    candidates: [
      {
        candidateId: "whisper-base-en",
        kind: "stt",
        samples: [
          {
            audioDurationMs: 1_000,
            exactMatch: false,
            expectedText: "list alarms",
            id,
            inputKind: "personal",
            repetitions: [createFailure(), createFailure(), createFailure()],
            speechEndMs: 900,
            wordErrorRate: null,
          },
        ],
      },
    ],
    corpusSha256: "a".repeat(64),
    device: {
      architecture: "x64",
      cpu: "test CPU",
      deviceId: "desktop-wsl2",
      kernel: "test kernel",
      os: "Linux",
    },
    repetitions: 3,
    schemaVersion: 1,
    startedAt: "2026-07-17T10:00:00.000Z",
    warmupRepetitions: 1,
  };
}

function createFailure() {
  return {
    diagnostic: "candidate failed",
    errorCategory: "execution",
    ok: false,
  } as const;
}
