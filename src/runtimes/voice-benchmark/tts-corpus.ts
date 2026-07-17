import {
  requireNonEmptyString as requireString,
  requireRecord,
  requireStableId,
} from "./structural-parsing.js";

interface TtsCorpusFixture {
  expectedFacts: readonly string[];
  id: string;
  text: string;
}

interface TtsCorpus {
  fixtures: readonly TtsCorpusFixture[];
  schemaVersion: 1;
}

export function parseTtsCorpus(input: unknown): TtsCorpus {
  const record = requireRecord(input, "TTS corpus");
  if (record.schemaVersion !== 1) {
    throw new Error("TTS corpus schemaVersion must be 1.");
  }
  if (!Array.isArray(record.fixtures) || record.fixtures.length === 0) {
    throw new Error("TTS corpus fixtures must be a nonempty array.");
  }
  const ids = new Set<string>();
  const fixtures = record.fixtures.map((inputFixture, index) => {
    const fixture = requireRecord(inputFixture, `fixtures[${index}]`);
    const id = requireStableId(fixture.id, `fixtures[${index}].id`);
    if (ids.has(id)) {
      throw new Error(`TTS corpus contains duplicate fixture ID ${id}.`);
    }
    ids.add(id);
    const text = requireString(fixture.text, `fixtures[${index}].text`);
    if (
      !Array.isArray(fixture.expectedFacts) ||
      fixture.expectedFacts.length === 0
    ) {
      throw new Error(`fixtures[${index}].expectedFacts must be nonempty.`);
    }
    const expectedFacts = fixture.expectedFacts.map((fact, factIndex) => {
      const parsed = requireString(
        fact,
        `fixtures[${index}].expectedFacts[${factIndex}]`,
      );
      if (!text.includes(parsed)) {
        throw new Error(
          `Expected fact ${parsed} must occur exactly in fixture text.`,
        );
      }
      return parsed;
    });
    if (new Set(expectedFacts).size !== expectedFacts.length) {
      throw new Error(`fixtures[${index}].expectedFacts contains duplicates.`);
    }
    return Object.freeze({
      expectedFacts: Object.freeze(expectedFacts),
      id,
      text,
    });
  });
  return Object.freeze({ fixtures: Object.freeze(fixtures), schemaVersion: 1 });
}
