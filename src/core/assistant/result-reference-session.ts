import type {
  AssistantResultReference,
  FeatureResultReferenceSet,
  CalendarResultReferenceFacts,
  InternetSourceResultReferenceFacts,
  ResolvedResultReference,
  ResultReferenceSelectionRequest,
  ResultReferenceTarget,
} from "../../ports/result-reference.js";
import { parseSpokenOrdinal } from "../../ports/spoken-ordinal.js";

export interface ResultReferenceSession {
  clear(): void;
  completeTurn(): void;
  publicReferences(): readonly AssistantResultReference[];
  select(
    request: ResultReferenceSelectionRequest,
  ): ResolvedResultReference | undefined;
  retain(resultSet: FeatureResultReferenceSet): void;
}

export function createResultReferenceSession(): ResultReferenceSession {
  let entries: readonly Entry[] = [];
  let subsequentTurns = 0;
  let focusedReference: string | undefined;
  let retainedSinceLastCompletion = false;

  return {
    clear() {
      entries = [];
      subsequentTurns = 0;
      focusedReference = undefined;
      retainedSinceLastCompletion = false;
    },
    completeTurn() {
      if (entries.length === 0) return;
      if (retainedSinceLastCompletion) {
        retainedSinceLastCompletion = false;
        return;
      }
      subsequentTurns += 1;
      if (subsequentTurns >= 3) {
        entries = [];
        focusedReference = undefined;
      }
    },
    publicReferences: () =>
      entries.map(({ publicReference }) => publicReference),
    select(request) {
      const spokenOrdinal = parseSpokenOrdinal(request.rawText);
      if (request.ordinal !== undefined && request.ordinal !== spokenOrdinal) {
        return;
      }

      let entry = spokenOrdinal
        ? entries.find(
            (candidate) => candidate.publicReference.ordinal === spokenOrdinal,
          )
        : entries.length === 1
          ? entries[0]
          : entries.find(
              (candidate) =>
                candidate.publicReference.reference === focusedReference,
            );
      if (
        !entry ||
        (request.reference !== undefined &&
          request.reference !== entry.publicReference.reference)
      ) {
        return;
      }

      if (request.next) {
        entry = entries.find(
          (candidate) =>
            candidate.publicReference.ordinal ===
            entry!.publicReference.ordinal + 1,
        );
        if (!entry) return;
      }

      focusedReference = entry.publicReference.reference;
      return {
        publicReference: entry.publicReference,
        target: entry.target,
      };
    },
    retain(resultSet) {
      entries =
        resultSet.kind === "calendar_events"
          ? resultSet.items
              .slice(0, 10)
              .map((item, index) => createCalendarEntry(item, index))
          : resultSet.items
              .slice(0, 10)
              .map((item, index) => createInternetSourceEntry(item, index));
      subsequentTurns = 0;
      focusedReference = undefined;
      retainedSinceLastCompletion = true;
    },
  };
}

interface Entry {
  readonly publicReference: AssistantResultReference;
  readonly target: ResultReferenceTarget;
}

function createCalendarEntry(
  item: {
    facts: CalendarResultReferenceFacts;
    target: Extract<ResultReferenceTarget, { kind: "calendar_event" }>;
  },
  index: number,
): Entry {
  return {
    publicReference: Object.freeze({
      facts: Object.freeze({ ...item.facts }),
      kind: "calendar_event",
      ordinal: index + 1,
      reference: `calendar-event-${index + 1}`,
    }),
    target: Object.freeze({ ...item.target }),
  };
}

function createInternetSourceEntry(
  item: {
    facts: InternetSourceResultReferenceFacts;
    target: Extract<ResultReferenceTarget, { kind: "internet_source" }>;
  },
  index: number,
): Entry {
  return {
    publicReference: Object.freeze({
      facts: Object.freeze({ ...item.facts }),
      kind: "internet_source",
      ordinal: index + 1,
      reference: `internet-source-${index + 1}`,
    }),
    target: Object.freeze({ ...item.target }),
  };
}
