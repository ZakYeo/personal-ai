import type {
  AssistantResultReference,
  FeatureResultReferenceSet,
  CalendarResultReferenceFacts,
  InternetSourceResultReferenceFacts,
  ResolvedResultReference,
  ResultReferenceSelectionRequest,
  ResultReferenceTarget,
  TaskResultReferenceFacts,
} from "../../ports/result-reference.js";
import { parseSpokenOrdinal } from "../../ports/spoken-ordinal.js";

export interface ResultReferenceSession {
  clear(): void;
  completeTurn(): void;
  invalidateForCompaction(): void;
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
  const clear = (): void => {
    entries = [];
    subsequentTurns = 0;
    focusedReference = undefined;
    retainedSinceLastCompletion = false;
  };

  return {
    clear,
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
    invalidateForCompaction() {
      if (!retainedSinceLastCompletion) clear();
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
        ...(entry.target ? { target: entry.target } : {}),
      };
    },
    retain(resultSet) {
      const descriptor = resultReferenceDescriptors[resultSet.kind];
      entries = resultSet.items
        .slice(0, 10)
        .map((item, index) => createEntry(item, descriptor, index));
      subsequentTurns = 0;
      focusedReference = undefined;
      retainedSinceLastCompletion = true;
    },
  };
}

interface Entry {
  readonly publicReference: AssistantResultReference;
  readonly target?: ResultReferenceTarget;
}

interface RetainedResultReference {
  readonly facts:
    | CalendarResultReferenceFacts
    | InternetSourceResultReferenceFacts
    | TaskResultReferenceFacts;
  readonly target?: ResultReferenceTarget;
}

interface ResultReferenceDescriptor {
  readonly itemKind: AssistantResultReference["kind"];
  readonly prefix: string;
}

const resultReferenceDescriptors = {
  calendar_events: {
    itemKind: "calendar_event",
    prefix: "calendar-event",
  },
  internet_sources: {
    itemKind: "internet_source",
    prefix: "internet-source",
  },
  task_items: {
    itemKind: "task_item",
    prefix: "task-item",
  },
} as const satisfies Record<
  FeatureResultReferenceSet["kind"],
  ResultReferenceDescriptor
>;

function createEntry(
  item: RetainedResultReference,
  descriptor: ResultReferenceDescriptor,
  index: number,
): Entry {
  const publicReference = Object.freeze({
    facts: Object.freeze({ ...item.facts }),
    kind: descriptor.itemKind,
    ordinal: index + 1,
    reference: `${descriptor.prefix}-${index + 1}`,
  }) as AssistantResultReference;
  return {
    publicReference,
    ...(item.target ? { target: Object.freeze({ ...item.target }) } : {}),
  };
}
