import {
  attentionDeliveryDecision,
  compareAttentionRules,
  createAttentionPreferences,
  defaultAttentionQuietHours,
} from "./attention-policy.js";
import type {
  AttentionDeliveryClaim,
  AttentionRule,
} from "../ports/attention.js";

const now = new Date("2026-09-07T12:00:00.000Z");
const rule = (id = "rule-1"): AttentionRule => ({
  id,
  name: "Due work",
  definition: { kind: "due_tasks", daysAhead: 0 },
  enabled: true,
  timeZone: "Europe/London",
  quietHours: { start: "22:00", end: "08:00" },
  cooldownMinutes: 60,
  provenance: {
    kind: "user_authored",
    request: "Enable due task attention",
    recordedAt: now.toISOString(),
  },
  revision: 1,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
});
function decide(
  overrides: Partial<AttentionRule> = {},
  claims: AttentionDeliveryClaim[] = [],
  time = now,
) {
  return attentionDeliveryDecision({
    rule: { ...rule(), ...overrides },
    key: "item-1",
    now: time,
    claims,
    preferences: createAttentionPreferences("Europe/London"),
  });
}

describe("explicit attention delivery policy", () => {
  it("defaults to five attempts per local day, quiet nights, and no permission from an absent enable", () => {
    expect(createAttentionPreferences("Europe/London")).toEqual({
      dailyBudget: 5,
      timeZone: "Europe/London",
    });
    expect(defaultAttentionQuietHours).toEqual({
      start: "22:00",
      end: "08:00",
    });
    expect(decide({ enabled: false })).toBe("disabled");
    expect(decide()).toBe("eligible");
  });
  it.each([
    ["2026-09-07T20:59:59.000Z", "eligible"],
    ["2026-09-07T21:00:00.000Z", "quiet_hours"],
    ["2026-09-08T06:59:59.000Z", "quiet_hours"],
    ["2026-09-08T07:00:00.000Z", "eligible"],
  ])("applies local quiet-hour boundaries at %s", (time, reason) => {
    expect(decide({}, [], new Date(time))).toBe(reason);
  });
  it("counts unknown attempts in the daily budget and deduplicates before any retry", () => {
    const claims = Array.from({ length: 5 }, (_, index) => ({
      ruleId: `other-${index}`,
      key: `old-${index}`,
      attemptedAt: "2026-09-07T08:00:00.000Z",
    }));
    expect(decide({}, claims)).toBe("daily_budget");
    expect(
      decide({}, [
        {
          ruleId: "rule-1",
          key: "item-1",
          attemptedAt: "2026-09-06T08:00:00.000Z",
        },
      ]),
    ).toBe("duplicate");
    expect(decide({}, claims, new Date("2026-09-08T12:00:00.000Z"))).toBe(
      "eligible",
    );
  });
  it("honors snooze and an hour cooling-off without extending either boundary", () => {
    expect(decide({ snoozedUntil: "2026-09-07T12:01:00.000Z" })).toBe(
      "snoozed",
    );
    expect(decide({ snoozedUntil: now.toISOString() })).toBe("eligible");
    expect(
      decide({}, [
        {
          ruleId: "rule-1",
          key: "different",
          attemptedAt: "2026-09-07T11:00:01.000Z",
        },
      ]),
    ).toBe("cooldown");
    expect(
      decide({}, [
        {
          ruleId: "rule-1",
          key: "different",
          attemptedAt: "2026-09-07T11:00:00.000Z",
        },
      ]),
    ).toBe("eligible");
  });
  it("fails closed on invalid or backward clocks", () => {
    expect(decide({}, [], new Date(Number.NaN))).toBe("invalid_clock");
    expect(
      decide({}, [
        {
          ruleId: "rule-1",
          key: "different",
          attemptedAt: "2026-09-07T13:00:00.000Z",
        },
      ]),
    ).toBe("invalid_clock");
  });
  it("prioritizes runtime failures before commitments and tasks with deterministic ties", () => {
    const health = {
      ...rule("health"),
      definition: { kind: "runtime_health" as const },
    };
    const calendar = {
      ...rule("calendar"),
      definition: { kind: "upcoming_calendar" as const, leadMinutes: 30 },
    };
    const rules = [rule("z"), calendar, rule("a"), health];
    expect([...rules].sort(compareAttentionRules).map(({ id }) => id)).toEqual([
      "health",
      "calendar",
      "a",
      "z",
    ]);
  });
});
