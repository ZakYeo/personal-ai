import type {
  AssistantResultReference,
  FeatureResultReferenceSet,
  CalendarResultReferenceFacts,
  InternetSourceResultReferenceFacts,
  ResolvedResultReference,
  ResultReferenceSelectionRequest,
  ResultReferenceTarget,
  TaskResultReferenceFacts,
  WeatherLocationResultReferenceFacts,
} from "../../ports/result-reference.js";
import { parseSpokenOrdinal } from "../../application/spoken-ordinal.js";

export interface ResultReferenceLookup {
  publicReferences(): readonly AssistantResultReference[];
  select(
    request: ResultReferenceSelectionRequest,
  ): ResolvedResultReference | undefined;
}

export interface ResultReferenceSession extends ResultReferenceLookup {
  completeTurn(): void;
  invalidateForCompaction(): void;
  publishDisplayed(
    resultSet: FeatureResultReferenceSet,
  ): readonly AssistantResultReference[];
}

export interface WorkflowResultReferenceOverlay extends ResultReferenceLookup {
  commitDisplayed(): void;
  retainPrivate(
    resultSet: FeatureResultReferenceSet,
  ): readonly AssistantResultReference[];
  stageDisplayed(
    resultSet: FeatureResultReferenceSet,
  ): readonly AssistantResultReference[];
}

export function createResultReferenceSession(): ResultReferenceSession {
  const states = new Map<AssistantResultReference["kind"], RetainedState>();

  return {
    completeTurn() {
      for (const [kind, state] of states) {
        if (state.retainedSinceLastCompletion) {
          state.retainedSinceLastCompletion = false;
          continue;
        }
        state.subsequentTurns += 1;
        if (state.subsequentTurns >= 3) states.delete(kind);
      }
    },
    invalidateForCompaction() {
      for (const [kind, state] of states) {
        if (!state.retainedSinceLastCompletion) states.delete(kind);
      }
    },
    publicReferences: () =>
      [...states.values()].flatMap(({ entries }) =>
        entries.map(({ publicReference }) => publicReference),
      ),
    select(request) {
      const state = states.get(request.expectedKind);
      if (!state) return;
      const spokenOrdinal =
        request.ordinalParsing === "enabled"
          ? parseSpokenOrdinal(request.rawText)
          : undefined;
      if (request.ordinal !== undefined && request.ordinal !== spokenOrdinal) {
        return;
      }

      let entry = spokenOrdinal
        ? state.entries.find(
            (candidate) => candidate.publicReference.ordinal === spokenOrdinal,
          )
        : state.entries.length === 1
          ? state.entries[0]
          : state.entries.find(
              (candidate) =>
                candidate.publicReference.reference === state.focusedReference,
            );
      if (
        !entry ||
        (request.reference !== undefined &&
          request.reference !== entry.publicReference.reference)
      ) {
        return;
      }

      if (request.next) {
        entry = state.entries.find(
          (candidate) =>
            candidate.publicReference.ordinal ===
            entry!.publicReference.ordinal + 1,
        );
        if (!entry) return;
      }

      state.focusedReference = entry.publicReference.reference;
      return {
        publicReference: entry.publicReference,
        ...(entry.target ? { target: entry.target } : {}),
      };
    },
    publishDisplayed(resultSet) {
      return retainResultSet(states, resultSet);
    },
  };
}

export function createWorkflowResultReferenceOverlay(
  parent: ResultReferenceSession,
): WorkflowResultReferenceOverlay {
  const local = createResultReferenceSession();
  const displayed = new Map<
    AssistantResultReference["kind"],
    FeatureResultReferenceSet
  >();
  const shadowed = new Set<AssistantResultReference["kind"]>();

  const retainPrivate = (resultSet: FeatureResultReferenceSet) => {
    const kind = resultReferenceDescriptors[resultSet.kind].itemKind;
    shadowed.add(kind);
    return local.publishDisplayed(resultSet);
  };

  return {
    commitDisplayed() {
      for (const resultSet of displayed.values()) {
        parent.publishDisplayed(resultSet);
      }
      displayed.clear();
    },
    publicReferences: () => [
      ...parent
        .publicReferences()
        .filter((reference) => !shadowed.has(reference.kind)),
      ...local.publicReferences(),
    ],
    select(request) {
      return shadowed.has(request.expectedKind)
        ? local.select(request)
        : parent.select(request);
    },
    retainPrivate,
    stageDisplayed(resultSet) {
      const references = retainPrivate(resultSet);
      displayed.set(
        resultReferenceDescriptors[resultSet.kind].itemKind,
        resultSet,
      );
      return references;
    },
  };
}

function retainResultSet(
  states: Map<AssistantResultReference["kind"], RetainedState>,
  resultSet: FeatureResultReferenceSet,
): readonly AssistantResultReference[] {
  const descriptor = resultReferenceDescriptors[resultSet.kind];
  const entries = resultSet.items
    .slice(0, 10)
    .map((item, index) => createEntry(item, descriptor, index));
  if (entries.length === 0) {
    states.delete(descriptor.itemKind);
    return [];
  }
  states.set(descriptor.itemKind, {
    entries,
    retainedSinceLastCompletion: true,
    subsequentTurns: 0,
  });
  return entries.map(({ publicReference }) => publicReference);
}

interface RetainedState {
  readonly entries: readonly Entry[];
  focusedReference?: string;
  retainedSinceLastCompletion: boolean;
  subsequentTurns: number;
}

interface Entry {
  readonly publicReference: AssistantResultReference;
  readonly target?: ResultReferenceTarget;
}

interface RetainedResultReference {
  readonly facts:
    | CalendarResultReferenceFacts
    | InternetSourceResultReferenceFacts
    | TaskResultReferenceFacts
    | WeatherLocationResultReferenceFacts;
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
  weather_locations: {
    itemKind: "weather_location",
    prefix: "weather-location",
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
    ...(item.target ? { target: freezeTarget(item.target) } : {}),
  };
}

function freezeTarget(target: ResultReferenceTarget): ResultReferenceTarget {
  return target.kind === "weather_location"
    ? Object.freeze({
        ...target,
        location: Object.freeze({ ...target.location }),
      })
    : Object.freeze({ ...target });
}
