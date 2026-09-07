import type { AttentionStore } from "../ports/attention.js";
import type { TaskStore } from "../ports/task-store.js";
import { changeAttentionItem } from "./attention-commands.js";
import { createOpaqueKey } from "./opaque-key.js";
import { attentionReminderKey } from "./attention-health-source.js";

/** Acknowledge the selected canonical claim; this never completes a task or sends output. */
export async function resolveAttentionReminder(
  store: AttentionStore,
  tasks: Pick<TaskStore, "listTasks" | "acknowledgeReminder">,
  selected: { id: string; expectedRevision: number },
  now: Date,
): Promise<boolean> {
  const state = await store.read();
  const item = state.inbox.find(
    (item) =>
      item.id === selected.id &&
      item.revision === selected.expectedRevision &&
      item.status === "open",
  );
  if (!item || item.facts.problem !== "reminder_delivery_unknown") return false;
  const rule = state.rules.find(
    (rule) =>
      rule.id === item.ruleId && rule.definition.kind === "runtime_health",
  );
  if (!rule) return false;
  const task = (await tasks.listTasks()).find(
    (task) =>
      task.reminder &&
      "claimedAt" in task.reminder &&
      createOpaqueKey(
        "attention",
        JSON.stringify([
          rule.definition,
          attentionReminderKey(task.id, task.reminder.claimedAt),
        ]),
      ) === item.key,
  );
  if (!task || !task.reminder) return false;
  if (task.reminder.status !== "acknowledged") {
    if (
      task.reminder.status !== "claimed" &&
      task.reminder.status !== "delivered"
    )
      return false;
    const acknowledged = await tasks.acknowledgeReminder({
      id: task.id,
      expectedRevision: task.revision,
      acknowledgedAt: now.toISOString(),
    });
    if (!acknowledged) return false;
  }
  // A crash after the canonical acknowledgement can safely resume this inbox-only write.
  return !!(await changeAttentionItem(
    store,
    { ...selected, action: "acknowledge" },
    now,
  ));
}
