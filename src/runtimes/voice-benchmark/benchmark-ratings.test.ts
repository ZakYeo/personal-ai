import {
  createBlindedRatingQueue,
  parseVoiceBenchmarkRatings,
  recordVoiceBenchmarkRating,
} from "./benchmark-ratings.js";

describe("voice benchmark ratings", () => {
  it("creates a stable blinded order without exposing candidate IDs", () => {
    const queue = createBlindedRatingQueue(createClips(), "result-sha");

    expect(queue.map(({ blindId }) => blindId)).toEqual([
      "sample-1621911c",
      "sample-ab0f1b7a",
    ]);
    expect(JSON.stringify(queue)).not.toContain("piper");
    expect(JSON.stringify(queue)).not.toContain("sherpa");
  });

  it("records ratings resumably and validates the 1-to-5 scale", () => {
    const queue = createBlindedRatingQueue(createClips(), "result-sha");
    const first = recordVoiceBenchmarkRating(
      { ratings: [], resultSha256: "result-sha", schemaVersion: 1 },
      queue[0]!,
      { intelligibility: 5, materialFactError: false, naturalness: 4 },
    );

    expect(first.ratings).toHaveLength(1);
    expect(() =>
      recordVoiceBenchmarkRating(first, queue[0]!, {
        intelligibility: 5,
        materialFactError: false,
        naturalness: 4,
      }),
    ).toThrow(/already rated/iu);
    expect(() =>
      recordVoiceBenchmarkRating(first, queue[1]!, {
        intelligibility: 0,
        materialFactError: false,
        naturalness: 4,
      }),
    ).toThrow(/intelligibility/iu);
  });

  it("parses persisted ratings from unknown", () => {
    expect(
      parseVoiceBenchmarkRatings({
        ratings: [
          {
            blindId: "sample-086fd2c9",
            candidateId: "piper-alba-medium",
            fixtureId: "calendar-time-v1",
            intelligibility: 5,
            materialFactError: false,
            naturalness: 4,
          },
        ],
        resultSha256: "a".repeat(64),
        schemaVersion: 1,
      }).ratings,
    ).toHaveLength(1);
  });
});

function createClips() {
  return [
    {
      audioPath: ".voice-benchmark/results/piper.wav",
      candidateId: "piper-alba-medium",
      fixtureId: "calendar-time-v1",
    },
    {
      audioPath: ".voice-benchmark/results/sherpa.wav",
      candidateId: "sherpa-amy-low",
      fixtureId: "calendar-time-v1",
    },
  ];
}
