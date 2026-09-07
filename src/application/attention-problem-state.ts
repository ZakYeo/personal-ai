import type { AttentionInboxItem, AttentionState } from "../ports/attention.js";
import type { TaskRecord } from "../ports/task-store.js";
import { attentionCandidateKey } from "./attention-candidate.js";
import { attentionReminderKey } from "./attention-health-source.js";

type ReminderInspection =
  | { kind: "not_reminder" | "unavailable" | "resolved" | "acknowledged" }
  | { kind: "unknown" | "delivered"; task: TaskRecord };

/** Resolve only the exact original claim against current canonical state; never infer a replacement target. */
export function inspectAttentionReminder(
  item: AttentionInboxItem,
  tasks: readonly TaskRecord[] | undefined,
): ReminderInspection {
  if (item.facts.problem !== "reminder_delivery_unknown")
    return { kind: "not_reminder" };
  if (!tasks) return { kind: "unavailable" };
  const task = tasks.find(
    (task) =>
      task.reminder &&
      "claimedAt" in task.reminder &&
      attentionCandidateKey(
        { kind: "runtime_health" },
        attentionReminderKey(task.id, task.reminder.claimedAt),
      ) === item.key,
  );
  if (!task || task.status !== "open" || !task.reminder)
    return { kind: "resolved" };
  switch (task.reminder.status) {
    case "acknowledged":
      return { kind: "acknowledged" };
    case "claimed":
      return { kind: "unknown", task };
    case "delivered":
      return { kind: "delivered", task };
    case "scheduled":
    case "cancelled":
      return { kind: "resolved" };
  }
}

const reminderText = {
  not_reminder: "",
  unavailable: "Current reminder state is unavailable.",
  resolved: "That reminder is no longer current. Nothing will be replayed.",
  acknowledged: "The reminder has already been acknowledged.",
  unknown: "Current reminder delivery remains unknown.",
  delivered:
    "The reminder now records completed delivery; it has not been acknowledged.",
} as const;

export function describeAttentionProblem(
  item: AttentionInboxItem,
  state: Pick<AttentionState, "rules" | "evaluations">,
  tasks: readonly TaskRecord[] | undefined,
) {
  const reminder = inspectAttentionReminder(item, tasks);
  return {
    text:
      reminder.kind === "not_reminder"
        ? describeSourceProblem(item, state)
        : reminderText[reminder.kind],
    canResolveReminder:
      item.status === "open" &&
      (reminder.kind === "unknown" || reminder.kind === "delivered"),
  };
}

function describeSourceProblem(
  item: AttentionInboxItem,
  state: Pick<AttentionState, "rules" | "evaluations">,
): string {
  if (item.facts.problem !== "source_unavailable") return "";
  const rule = state.rules.find(
    (rule) =>
      attentionCandidateKey(
        { kind: "runtime_health" },
        `source:${rule.id}:${rule.revision}`,
      ) === item.key,
  );
  if (!rule || !rule.enabled)
    return "The originating source rule is no longer active.";
  const completed = state.evaluations.find(
    (entry) => entry.ruleId === rule.id && entry.ruleRevision === rule.revision,
  )?.completed;
  if (!completed) return "Current source status is unavailable.";
  return completed.reason === "source_unavailable"
    ? "The latest completed source check still failed."
    : "The latest completed source check succeeded.";
}
