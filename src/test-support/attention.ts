import type { AttentionInboxItem, AttentionRule } from "../ports/attention.js";

export { createInMemoryAttentionStore as createTestAttentionStore } from "../adapters/local/attention-store.js";

const recordedAt = "2026-09-07T12:00:00.000Z";

export function createTestAttentionRule(): AttentionRule {
  return {
    id: "attention-rule-1",
    name: "Due work",
    definition: { kind: "due_tasks", daysAhead: 0 },
    enabled: true,
    timeZone: "Europe/London",
    quietHours: { start: "22:00", end: "08:00" },
    cooldownMinutes: 60,
    provenance: {
      kind: "user_authored",
      request: "Enable due task attention",
      recordedAt,
    },
    revision: 1,
    createdAt: recordedAt,
    updatedAt: recordedAt,
  };
}

export function createTestAttentionItem(
  rule = createTestAttentionRule(),
): AttentionInboxItem {
  return {
    id: "attention-item-2",
    ruleId: rule.id,
    ruleName: rule.name,
    key: "task-due-1",
    text: "Review the plan is due.",
    explanation:
      "Your enabled due-work rule found an open task at its due date.",
    timeZone: rule.timeZone,
    facts: { taskLabel: "Review the plan", dueDate: "2026-09-07" },
    provenance: rule.provenance,
    observedAt: recordedAt,
    createdAt: recordedAt,
    updatedAt: recordedAt,
    revision: 1,
    status: "open",
    delivery: { status: "unknown", attemptedAt: recordedAt },
  };
}
