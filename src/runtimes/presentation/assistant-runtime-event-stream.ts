import {
  createInitialAssistantPresentationSnapshot,
  reduceAssistantRuntimeEvent,
  type AssistantRuntimeEvent,
  type AssistantPresentationSnapshot,
} from "./assistant-runtime-event.js";
import { parseAssistantRuntimeEvent } from "../../application/presentation-event-parser.js";

export type { AssistantRuntimeEvent } from "./assistant-runtime-event.js";

type WithoutEventMetadata<TEvent> = TEvent extends AssistantRuntimeEvent
  ? Omit<TEvent, "occurredAt" | "sequence">
  : never;

export type PendingAssistantRuntimeEvent =
  WithoutEventMetadata<AssistantRuntimeEvent>;

export interface AssistantRuntimeEventCursor {
  readonly instanceId: string;
  readonly sequence: number;
}

export type AssistantRuntimeEventReplay =
  | {
      readonly events: readonly AssistantRuntimeEvent[];
      readonly kind: "events";
    }
  | {
      readonly kind: "snapshot";
      readonly snapshot: AssistantPresentationSnapshot;
    };

export interface AssistantRuntimeEventStream {
  publish(event: PendingAssistantRuntimeEvent): AssistantRuntimeEvent;
  readSince(cursor: AssistantRuntimeEventCursor): AssistantRuntimeEventReplay;
  snapshot(): AssistantPresentationSnapshot;
  subscribe(listener: (event: AssistantRuntimeEvent) => void): () => void;
}

const defaultReplayLimit = 256;

export function createAssistantRuntimeEventStream(options: {
  readonly instanceId: string;
  readonly now: () => Date;
  readonly onListenerError?: (error: unknown) => void;
  readonly replayLimit?: number;
}): AssistantRuntimeEventStream {
  const replayLimit = options.replayLimit ?? defaultReplayLimit;
  if (!Number.isInteger(replayLimit) || replayLimit < 1) {
    throw new Error("Presentation replay limit must be a positive integer.");
  }

  let current = createInitialAssistantPresentationSnapshot({
    instanceId: options.instanceId,
    microphone: "available",
  });
  const events: AssistantRuntimeEvent[] = [];
  const listeners = new Set<(event: AssistantRuntimeEvent) => void>();

  return Object.freeze({
    publish(pending: PendingAssistantRuntimeEvent) {
      const event = parseAssistantRuntimeEvent({
        ...pending,
        occurredAt: options.now().toISOString(),
        sequence: current.sequence + 1,
      });
      if (!event) {
        throw new Error("Presentation event failed canonical validation.");
      }
      deepFreeze(event);
      current = reduceAssistantRuntimeEvent(current, event);
      events.push(event);
      if (events.length > replayLimit)
        events.splice(0, events.length - replayLimit);
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          options.onListenerError?.(error);
        }
      }
      return event;
    },
    readSince(
      cursor: AssistantRuntimeEventCursor,
    ): AssistantRuntimeEventReplay {
      if (
        cursor.instanceId !== current.instanceId ||
        !Number.isInteger(cursor.sequence) ||
        cursor.sequence < 0 ||
        cursor.sequence > current.sequence
      ) {
        return Object.freeze({ kind: "snapshot", snapshot: current });
      }
      const expected = cursor.sequence + 1;
      const retained = events.filter((event) => event.sequence >= expected);
      if (expected <= current.sequence && retained[0]?.sequence !== expected) {
        return Object.freeze({ kind: "snapshot", snapshot: current });
      }
      return Object.freeze({
        events: Object.freeze(retained),
        kind: "events",
      });
    },
    snapshot: () => current,
    subscribe(listener: (event: AssistantRuntimeEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
