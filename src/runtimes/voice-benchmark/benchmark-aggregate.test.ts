import { aggregateBenchmarkChunks } from "./benchmark-aggregate.js";

describe("voice benchmark aggregation", () => {
  it("merges disjoint resumable samples and rejects duplicates", () => {
    const first = createChunk("alarm-list-v1");
    const second = createChunk("alarm-create-v1");
    expect(
      aggregateBenchmarkChunks([first, second]).candidates[0]?.samples,
    ).toHaveLength(2);
    expect(() => aggregateBenchmarkChunks([first, first])).toThrow(
      /duplicate/iu,
    );
  });
});

function createChunk(id: string) {
  return {
    candidates: [
      { candidateId: "whisper-base-en", kind: "stt", samples: [{ id }] },
    ],
    corpusSha256: "a".repeat(64),
    device: { deviceId: "desktop-wsl2" },
    repetitions: 3,
    schemaVersion: 1,
    startedAt: "2026-07-17T10:00:00.000Z",
    warmupRepetitions: 1,
  };
}
