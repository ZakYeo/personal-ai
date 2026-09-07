import type {
  AttentionRule,
  AttentionRuleDefinition,
} from "../../ports/attention.js";
import { decodeWeatherWatchCondition } from "../../application/weather-watch-condition-policy.js";
import { isValidWeatherLocation } from "../../application/weather-policy.js";
import {
  attentionFields as field,
  invalidAttentionState,
} from "./attention-state-fields.js";

export function parseAttentionRule(value: unknown): AttentionRule {
  const item = field.record(value, [
    "id",
    "name",
    "definition",
    "enabled",
    "timeZone",
    "quietHours",
    "cooldownMinutes",
    "snoozedUntil",
    "provenance",
    "revision",
    "createdAt",
    "updatedAt",
  ]);
  const quiet = field.record(item.quietHours, ["start", "end"]);
  const rule: AttentionRule = {
    id: field.text(item.id, 80),
    name: field.text(item.name, 80),
    definition: parseDefinition(item.definition),
    enabled: field.boolean(item.enabled),
    timeZone: field.timeZone(item.timeZone),
    quietHours: { start: localTime(quiet.start), end: localTime(quiet.end) },
    cooldownMinutes: field.integer(item.cooldownMinutes, 1, 1_440),
    provenance: parseAttentionProvenance(item.provenance),
    revision: field.integer(item.revision),
    createdAt: field.timestamp(item.createdAt),
    updatedAt: field.timestamp(item.updatedAt),
    ...(item.snoozedUntil === undefined
      ? {}
      : { snoozedUntil: field.timestamp(item.snoozedUntil) }),
  };
  if (
    rule.updatedAt < rule.createdAt ||
    rule.provenance.recordedAt > rule.updatedAt ||
    rule.quietHours.start === rule.quietHours.end
  )
    throw invalidAttentionState();
  return rule;
}

export function parseAttentionProvenance(
  value: unknown,
): AttentionRule["provenance"] {
  const item = field.record(value, ["kind", "request", "recordedAt"]);
  return {
    kind: field.choice(item.kind, ["user_authored"]),
    request: field.text(item.request),
    recordedAt: field.timestamp(item.recordedAt),
  };
}

function parseDefinition(value: unknown): AttentionRuleDefinition {
  const item = field.record(value, [
    "kind",
    "leadMinutes",
    "daysAhead",
    "lookAheadHours",
    "localTime",
    "location",
    "condition",
    "periodHours",
  ]);
  switch (item.kind) {
    case "upcoming_calendar":
      field.record(item, ["kind", "leadMinutes"]);
      return {
        kind: item.kind,
        leadMinutes: field.integer(item.leadMinutes, 1, 1_440),
      };
    case "due_tasks":
      field.record(item, ["kind", "daysAhead"]);
      return {
        kind: item.kind,
        daysAhead: field.integer(item.daysAhead, 0, 7),
      };
    case "conflicting_commitments":
      field.record(item, ["kind", "lookAheadHours"]);
      return {
        kind: item.kind,
        lookAheadHours: field.integer(item.lookAheadHours, 1, 48),
      };
    case "runtime_health":
      field.record(item, ["kind"]);
      return { kind: item.kind };
    case "morning_routine":
      field.record(item, ["kind", "localTime"]);
      return { kind: item.kind, localTime: localTime(item.localTime) };
    case "material_weather": {
      field.record(item, ["kind", "location", "condition", "periodHours"]);
      const stored = field.record(item.location, [
        "countryCode",
        "latitude",
        "longitude",
        "name",
        "timezone",
      ]);
      const location = {
        countryCode: field.text(stored.countryCode, 2),
        latitude: field.finite(stored.latitude),
        longitude: field.finite(stored.longitude),
        name: field.text(stored.name, 120),
        timezone: field.timeZone(stored.timezone),
      };
      if (!isValidWeatherLocation(location)) throw invalidAttentionState();
      const condition = field.record(item.condition, [
        "metric",
        "operator",
        "threshold",
        "unit",
      ]);
      return {
        kind: item.kind,
        location,
        periodHours: field.integer(item.periodHours, 1, 48),
        condition: decodeWeatherWatchCondition({
          metric: field.text(condition.metric, 32),
          operator: field.text(condition.operator, 32),
          threshold: field.finite(condition.threshold),
          unit: field.text(condition.unit, 16),
        }),
      };
    }
    default:
      throw invalidAttentionState();
  }
}

function localTime(value: unknown): string {
  const text = field.text(value, 5);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(text)) throw invalidAttentionState();
  return text;
}
