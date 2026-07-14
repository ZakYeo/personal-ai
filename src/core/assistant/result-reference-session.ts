import type {
  AssistantResultReference,
  FeatureResultReferenceSet,
  ResultReferenceTarget,
} from "../../ports/result-reference.js";

export interface ResultReferenceSession {
  clear(): void;
  completeTurn(): void;
  publicReferences(): readonly AssistantResultReference[];
  resolve(reference: string): ResultReferenceTarget | undefined;
  retain(resultSet: FeatureResultReferenceSet): void;
}

export function createResultReferenceSession(): ResultReferenceSession {
  let entries: readonly Entry[] = [];
  let subsequentTurns = 0;

  return {
    clear() {
      entries = [];
      subsequentTurns = 0;
    },
    completeTurn() {
      if (entries.length === 0) return;
      subsequentTurns += 1;
      if (subsequentTurns >= 3) entries = [];
    },
    publicReferences: () =>
      entries.map(({ publicReference }) => publicReference),
    resolve: (reference) =>
      entries.find((entry) => entry.publicReference.reference === reference)
        ?.target,
    retain(resultSet) {
      entries = resultSet.items.slice(0, 10).map((item, index) => ({
        publicReference: Object.freeze({
          facts: Object.freeze({ ...item.facts }),
          kind: "calendar_event" as const,
          ordinal: index + 1,
          reference: `calendar-event-${index + 1}`,
        }),
        target: Object.freeze({ ...item.target }),
      }));
      subsequentTurns = 0;
    },
  };
}

interface Entry {
  readonly publicReference: AssistantResultReference;
  readonly target: ResultReferenceTarget;
}
