export interface AssistantResultReference {
  readonly facts: CalendarResultReferenceFacts;
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
    readonly facts: CalendarResultReferenceFacts;
    readonly target: ResultReferenceTarget;
  }[];
  readonly kind: "calendar_events";
}

export interface CalendarResultReferenceFacts {
  readonly date: string;
  readonly time: string;
  readonly title: string;
}

export interface ResolvedResultReference {
  readonly publicReference: AssistantResultReference;
  readonly target: ResultReferenceTarget;
}

export interface ResultReferenceSelectionRequest {
  readonly next?: boolean;
  readonly ordinal?: number;
  readonly rawText: string;
  readonly reference?: string;
}
