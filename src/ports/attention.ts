import type { WeatherLocation } from "./weather.js";
import type { WeatherWatchCondition } from "./weather-watch-store.js";
import type { ResponsePresentationReceipt } from "./response-presentation.js";

export type AttentionRuleDefinition =
  | { readonly kind: "upcoming_calendar"; readonly leadMinutes: number }
  | { readonly kind: "due_tasks"; readonly daysAhead: number }
  | {
      readonly kind: "conflicting_commitments";
      readonly lookAheadHours: number;
    }
  | {
      readonly kind: "material_weather";
      readonly location: WeatherLocation;
      readonly condition: WeatherWatchCondition;
      readonly periodHours: number;
    }
  | { readonly kind: "runtime_health" }
  | { readonly kind: "morning_routine"; readonly localTime: string };

export interface AttentionRule {
  readonly id: string;
  readonly name: string;
  readonly definition: AttentionRuleDefinition;
  readonly enabled: boolean;
  readonly timeZone: string;
  readonly quietHours: { readonly start: string; readonly end: string };
  readonly cooldownMinutes: number;
  readonly snoozedUntil?: string;
  readonly provenance: {
    readonly kind: "user_authored";
    readonly request: string;
    readonly recordedAt: string;
  };
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AttentionPreferences {
  readonly dailyBudget: number;
  readonly timeZone: string;
}

/** A durable claim counts even when output completion is unknown. */
export interface AttentionDeliveryClaim {
  readonly ruleId: string;
  readonly key: string;
  readonly attemptedAt: string;
}

export type AttentionDeliveryDecision =
  | "eligible"
  | "disabled"
  | "snoozed"
  | "quiet_hours"
  | "cooldown"
  | "daily_budget"
  | "duplicate"
  | "invalid_clock";

export type AttentionDeliveryState =
  | {
      readonly status: "not_sent";
      readonly reason: AttentionDeliveryDecision | "output_unavailable";
    }
  | { readonly status: "unknown"; readonly attemptedAt: string }
  | {
      readonly status: "delivered";
      readonly attemptedAt: string;
      readonly deliveredAt: string;
    };

export interface AttentionInboxItem {
  readonly id: string;
  readonly ruleId: string;
  readonly ruleName: string;
  readonly key: string;
  readonly text: string;
  readonly explanation: string;
  readonly timeZone: string;
  readonly facts: Readonly<Record<string, string | number | boolean>>;
  readonly provenance: AttentionRule["provenance"];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revision: number;
  readonly status: "open" | "acknowledged" | "dismissed";
  readonly snoozedUntil?: string;
  readonly delivery: AttentionDeliveryState;
}

export interface AttentionEvaluation {
  readonly ruleId: string;
  readonly ruleRevision: number;
  readonly slot: number;
  readonly evaluatedAt: string;
  readonly reason:
    | "evaluating"
    | "matched"
    | "no_match"
    | "source_unavailable"
    | "inbox_full"
    | "disabled"
    | "snoozed";
}

export interface AttentionState {
  readonly version: 1;
  readonly revision: number;
  readonly nextId: number;
  readonly preferences: AttentionPreferences;
  readonly rules: readonly AttentionRule[];
  readonly inbox: readonly AttentionInboxItem[];
  readonly evaluations: readonly AttentionEvaluation[];
}

export interface AttentionStore {
  read(): Promise<AttentionState>;
  replace(expectedRevision: number, next: AttentionState): Promise<boolean>;
}

export interface AttentionCandidate {
  readonly key: string;
  readonly text: string;
  readonly explanation: string;
  readonly timeZone: string;
  readonly facts: AttentionInboxItem["facts"];
  readonly presentation?: ResponsePresentationReceipt;
}

export interface AttentionSourceReaderPort {
  read(
    request: {
      readonly definition: AttentionRuleDefinition;
      readonly timeZone: string;
    },
    context: { readonly now: Date; readonly signal?: AbortSignal },
  ): Promise<readonly AttentionCandidate[]>;
}
