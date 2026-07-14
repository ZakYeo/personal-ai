export interface AssistantResultReference {
  readonly facts: ResultReferenceFacts;
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
    readonly facts: ResultReferenceFacts;
    readonly target: ResultReferenceTarget;
  }[];
  readonly kind: "calendar_events";
}

export type ResultReferenceFacts = Record<
  string,
  string | number | boolean | null | undefined
>;
