import type {
  AttentionDeliveryClaim,
  AttentionDeliveryDecision,
  AttentionPreferences,
  AttentionRule,
} from "../ports/attention.js";
import { zonedParts } from "./local-date-time.js";
import { isCanonicalTimeZoneIdentifier } from "./temporal-policy.js";

export const defaultAttentionQuietHours = Object.freeze({
  start: "22:00",
  end: "08:00",
});

export function createAttentionPreferences(
  timeZone: string,
): AttentionPreferences {
  if (!isCanonicalTimeZoneIdentifier(timeZone))
    throw new Error("Attention requires an explicit valid timezone.");
  return Object.freeze({ dailyBudget: 5, timeZone });
}

export function attentionDeliveryDecision(input: {
  readonly rule: AttentionRule;
  readonly key: string;
  readonly now: Date;
  readonly claims: readonly AttentionDeliveryClaim[];
  readonly preferences: AttentionPreferences;
}): AttentionDeliveryDecision {
  const { rule, claims, now, preferences } = input;
  if (!rule.enabled) return "disabled";
  const instant = now.getTime();
  if (
    !Number.isFinite(instant) ||
    claims.some(
      (claim) =>
        !Number.isFinite(Date.parse(claim.attemptedAt)) ||
        Date.parse(claim.attemptedAt) > instant,
    )
  )
    return "invalid_clock";
  if (rule.snoozedUntil && Date.parse(rule.snoozedUntil) > instant)
    return "snoozed";
  if (
    claims.some((claim) => claim.ruleId === rule.id && claim.key === input.key)
  )
    return "duplicate";
  if (
    claims.some(
      (claim) =>
        claim.ruleId === rule.id &&
        instant - Date.parse(claim.attemptedAt) < rule.cooldownMinutes * 60_000,
    )
  )
    return "cooldown";
  const local = zonedParts(now, rule.timeZone);
  const localTime = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
  const { start, end } = rule.quietHours;
  if (
    start < end
      ? localTime >= start && localTime < end
      : localTime >= start || localTime < end
  )
    return "quiet_hours";
  const day = attentionLocalDate(now, preferences.timeZone);
  if (
    claims.filter(
      (claim) =>
        attentionLocalDate(
          new Date(claim.attemptedAt),
          preferences.timeZone,
        ) === day,
    ).length >= preferences.dailyBudget
  )
    return "daily_budget";
  return "eligible";
}

const priorities: Record<AttentionRule["definition"]["kind"], number> = {
  runtime_health: 0,
  conflicting_commitments: 1,
  upcoming_calendar: 2,
  due_tasks: 3,
  morning_routine: 4,
  material_weather: 5,
};

export function compareAttentionRules(
  left: AttentionRule,
  right: AttentionRule,
): number {
  return (
    priorities[left.definition.kind] - priorities[right.definition.kind] ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

function attentionLocalDate(now: Date, timeZone: string): string {
  const parts = zonedParts(now, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}
