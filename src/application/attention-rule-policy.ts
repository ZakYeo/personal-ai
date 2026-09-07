import type {
  AttentionRule,
  AttentionRuleDefinition,
} from "../ports/attention.js";
import { isCanonicalTimeZoneIdentifier } from "./temporal-policy.js";
import { containsControlCharacters } from "./text-safety.js";
import { isValidWeatherLocation } from "./weather-policy.js";
import { assertValidWeatherWatchCondition } from "./weather-watch-condition-policy.js";
import { defaultAttentionQuietHours } from "./attention-policy.js";

export interface NewAttentionRuleInput {
  readonly name: string;
  readonly definition: AttentionRuleDefinition;
  readonly timeZone: string;
  readonly quietHours?: AttentionRule["quietHours"];
  readonly cooldownMinutes?: number;
  readonly request: string;
}

export function normalizeAttentionRuleSettings(
  input: Omit<NewAttentionRuleInput, "definition">,
) {
  const name = input.name.trim();
  if (
    !name ||
    name.length > 80 ||
    containsControlCharacters(name) ||
    !input.request.trim() ||
    input.request.length > 1_000 ||
    containsControlCharacters(input.request) ||
    !isCanonicalTimeZoneIdentifier(input.timeZone)
  )
    throw new Error(
      "Attention rule requires a bounded name, explicit timezone, and user-authored request.",
    );
  const quietHours = { ...(input.quietHours ?? defaultAttentionQuietHours) };
  const cooldownMinutes = input.cooldownMinutes ?? 60;
  if (
    ![quietHours.start, quietHours.end].every((time) =>
      /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(time),
    ) ||
    quietHours.start === quietHours.end
  )
    throw new Error(
      "Attention quiet hours require different valid local start and end times.",
    );
  requireInteger(cooldownMinutes, 1, 1_440);
  return {
    name,
    timeZone: input.timeZone,
    quietHours,
    cooldownMinutes,
    request: input.request,
  };
}

export function normalizeAttentionRuleInput(input: NewAttentionRuleInput) {
  const settings = normalizeAttentionRuleSettings(input);
  const definition = structuredClone(input.definition);
  switch (definition.kind) {
    case "upcoming_calendar":
      requireInteger(definition.leadMinutes, 1, 1_440);
      break;
    case "due_tasks":
      requireInteger(definition.daysAhead, 0, 7);
      break;
    case "conflicting_commitments":
      requireInteger(definition.lookAheadHours, 1, 48);
      break;
    case "material_weather":
      requireInteger(definition.periodHours, 1, 48);
      if (!isValidWeatherLocation(definition.location))
        throw new Error("Attention weather requires a validated location.");
      assertValidWeatherWatchCondition(definition.condition);
      break;
    case "morning_routine":
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(definition.localTime))
        throw new Error("The morning routine requires a valid local time.");
      break;
    case "runtime_health":
      break;
  }
  return { ...settings, definition };
}

export function attentionSnoozeUntil(now: Date, minutes: number): string {
  requireInteger(minutes, 1, 10_080);
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

function requireInteger(value: number, minimum: number, maximum: number): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new Error("Attention rule value is outside its supported bounds.");
}
