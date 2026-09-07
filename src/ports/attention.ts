import type { WeatherLocation } from "./weather.js";
import type { WeatherWatchCondition } from "./weather-watch-store.js";

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
