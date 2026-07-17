const ordinalWords = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
] as const;

const spokenOrdinalPattern = new RegExp(
  `\\b(${ordinalWords.join("|")})\\b`,
  "u",
);
const spokenOrdinals: ReadonlyMap<string, number> = new Map(
  ordinalWords.map((word, index) => [word, index + 1]),
);

export function parseSpokenOrdinal(text: string): number | undefined {
  const word = text.toLowerCase().match(spokenOrdinalPattern)?.[1];
  return word ? spokenOrdinals.get(word) : undefined;
}
