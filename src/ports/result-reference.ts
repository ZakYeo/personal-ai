import type { WeatherLocation } from "./weather.js";

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
    })
  | (AssistantResultReferenceBase & {
      readonly facts: TaskResultReferenceFacts;
      readonly kind: "task_item";
    })
  | (AssistantResultReferenceBase & {
      readonly facts: WeatherLocationResultReferenceFacts;
      readonly kind: "weather_location";
    });

export type ResultReferenceTarget =
  | {
      readonly kind: "calendar_event";
      readonly providerEventId: string;
    }
  | {
      readonly kind: "task_item";
      readonly listId: string;
      readonly listRevision: number;
      readonly revision: number;
      readonly taskId: string;
    }
  | {
      readonly kind: "weather_location";
      readonly location: WeatherLocation;
    };

interface CalendarFeatureResultReference {
  readonly facts: CalendarResultReferenceFacts;
  readonly target: Extract<ResultReferenceTarget, { kind: "calendar_event" }>;
}

interface InternetSourceFeatureResultReference {
  readonly facts: InternetSourceResultReferenceFacts;
}

interface TaskFeatureResultReference {
  readonly facts: TaskResultReferenceFacts;
  readonly target: Extract<ResultReferenceTarget, { kind: "task_item" }>;
}

interface WeatherLocationFeatureResultReference {
  readonly facts: WeatherLocationResultReferenceFacts;
  readonly target: Extract<ResultReferenceTarget, { kind: "weather_location" }>;
}

export type FeatureResultReferenceSet =
  | {
      readonly items: readonly CalendarFeatureResultReference[];
      readonly kind: "calendar_events";
    }
  | {
      readonly items: readonly InternetSourceFeatureResultReference[];
      readonly kind: "internet_sources";
    }
  | {
      readonly items: readonly TaskFeatureResultReference[];
      readonly kind: "task_items";
    }
  | {
      readonly items: readonly WeatherLocationFeatureResultReference[];
      readonly kind: "weather_locations";
    };

export interface CalendarResultReferenceFacts {
  readonly date: string;
  readonly startAt?: string;
  readonly time: string;
  readonly title: string;
}

export interface InternetSourceResultReferenceFacts {
  readonly extract?: string;
  readonly publishedAt?: string;
  readonly title: string;
  readonly url: string;
}

export interface TaskResultReferenceFacts {
  readonly dueDate?: string;
  readonly label: string;
  readonly listName: string;
  readonly reminderAt?: string;
  readonly status: "completed" | "open";
}

export interface WeatherLocationResultReferenceFacts {
  readonly countryCode: string;
  readonly name: string;
  readonly timezone: string;
}

export interface ResolvedResultReference {
  readonly publicReference: AssistantResultReference;
  readonly target?: ResultReferenceTarget;
}

export interface ResultReferenceSelectionRequest {
  readonly expectedKind: AssistantResultReference["kind"];
  readonly next?: boolean;
  readonly ordinal?: number;
  readonly ordinalParsing: "disabled" | "enabled";
  readonly rawText: string;
  readonly reference?: string;
}
