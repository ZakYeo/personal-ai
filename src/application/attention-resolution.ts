import type { AttentionStore } from "../ports/attention.js";
import type { TaskStore } from "../ports/task-store.js";
import { changeAttentionItem } from "./attention-commands.js";
import { inspectAttentionReminder } from "./attention-problem-state.js";

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
  const reminder = inspectAttentionReminder(item, await tasks.listTasks());
  if (reminder.kind === "unavailable" || reminder.kind === "not_reminder")
    return false;
  if (reminder.kind === "unknown" || reminder.kind === "delivered") {
    const task = reminder.task;
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
