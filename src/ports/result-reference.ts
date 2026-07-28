interface AssistantResultReferenceBase {
  readonly ordinal: number;
  readonly reference: string;
}

export type AssistantResultReference =
  | (AssistantResultReferenceBase & {
      readonly facts: CalendarResultReferenceFacts;
      readonly kind: "calendar_event";
    })
  | (AssistantResultReferenceBase & {
      readonly facts: InternetSourceResultReferenceFacts;
      readonly kind: "internet_source";
    });

export type ResultReferenceTarget =
  | {
      readonly kind: "calendar_event";
      readonly providerEventId: string;
    }
  | {
      readonly kind: "internet_source";
      readonly providerResultId: string;
    };

interface CalendarFeatureResultReference {
  readonly facts: CalendarResultReferenceFacts;
  readonly target: Extract<ResultReferenceTarget, { kind: "calendar_event" }>;
}

interface InternetSourceFeatureResultReference {
  readonly facts: InternetSourceResultReferenceFacts;
  readonly target: Extract<ResultReferenceTarget, { kind: "internet_source" }>;
}

export type FeatureResultReferenceSet =
  | {
      readonly items: readonly CalendarFeatureResultReference[];
      readonly kind: "calendar_events";
    }
  | {
      readonly items: readonly InternetSourceFeatureResultReference[];
      readonly kind: "internet_sources";
    };

export interface CalendarResultReferenceFacts {
  readonly date: string;
  readonly startAt?: string;
  readonly time: string;
  readonly title: string;
}

export interface InternetSourceResultReferenceFacts {
  readonly extract: string;
  readonly publishedAt?: string;
  readonly title: string;
  readonly url: string;
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
