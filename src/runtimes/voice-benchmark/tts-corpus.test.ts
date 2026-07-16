import { readFile } from "node:fs/promises";
import { parseTtsCorpus } from "./tts-corpus.js";

describe("voice benchmark TTS corpus", () => {
  it("parses stable fact-bearing response fixtures", async () => {
    const corpus = parseTtsCorpus(
      JSON.parse(
        await readFile("benchmarks/voice/corpus/tts-responses.json", "utf8"),
      ) as unknown,
    );

    expect(corpus.fixtures).toHaveLength(8);
    expect(
      corpus.fixtures.every((fixture) => fixture.expectedFacts.length > 0),
    ).toBe(true);
  });

  it("rejects duplicate IDs and facts absent from the spoken text", () => {
    const fixture = {
      expectedFacts: ["11am"],
      id: "calendar-time-v1",
      text: "Your appointment is at noon.",
    };
    expect(() =>
      parseTtsCorpus({ fixtures: [fixture], schemaVersion: 1 }),
    ).toThrow(/11am.*text/iu);
    expect(() =>
      parseTtsCorpus({
        fixtures: [
          { ...fixture, text: "Your appointment is at 11am." },
          { ...fixture, text: "Your appointment is at 11am." },
        ],
        schemaVersion: 1,
      }),
    ).toThrow(/duplicate/iu);
  });
});
