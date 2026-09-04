import {
  emptyAssistantPresentationProjection,
  parseAssistantPresentationProjection,
} from "../../application/presentation-projection.js";
import type { AssistantPresentationProjection } from "../../ports/presentation.js";

export interface PresentationProjectionStream {
  snapshot(): AssistantPresentationProjection;
  subscribe(
    listener: (projection: AssistantPresentationProjection) => void,
  ): () => void;
  update(projection: AssistantPresentationProjection): void;
}

export function createPresentationProjectionStream(): PresentationProjectionStream {
  let current = emptyAssistantPresentationProjection;
  const listeners = new Set<
    (projection: AssistantPresentationProjection) => void
  >();
  const stream: PresentationProjectionStream = {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(projection) {
      const validated = parseAssistantPresentationProjection(projection);
      if (!validated) {
        throw new Error("Presentation projection failed canonical validation.");
      }
      current = deepFreeze(validated);
      for (const listener of listeners) listener(current);
    },
  };
  return Object.freeze(stream);
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
