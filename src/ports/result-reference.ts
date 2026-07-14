import type { AssistantCommandParameters } from "./assistant.js";

export interface AssistantResultReference {
  readonly facts: AssistantCommandParameters;
  readonly kind: "calendar_event";
  readonly ordinal: number;
  readonly reference: string;
}

export interface ResultReferenceTarget {
  readonly kind: "calendar_event";
  readonly providerEventId: string;
}

export interface FeatureResultReferenceSet {
  readonly items: readonly {
    readonly facts: AssistantCommandParameters;
    readonly target: ResultReferenceTarget;
  }[];
  readonly kind: "calendar_events";
}
