import {
  defineCapability,
  type FeatureExecutionContext,
  type FeatureResult,
} from "../../application/feature.js";
import type {
  TaskListRecord,
  TaskRecord,
  TaskStore,
} from "../../ports/task-store.js";
import {
  selectEligibleTask,
  taskTargetParameters,
  type TaskTargetArgs,
} from "./task-selection.js";
import { taskSpokenSummary } from "./task-capability-metadata.js";

export function createTaskReminderAcknowledgementCapability(store: TaskStore) {
  return defineCapability({
    description:
      "Acknowledge one delivered or interrupted task reminder without completing its task.",
    execute: (request, context) =>
      acknowledgeTaskReminder(store, request.args, context),
    parameters: taskTargetParameters,
    risk: "low",
    spokenSummary: taskSpokenSummary,
    summary: "Acknowledge one task reminder.",
  });
}

async function acknowledgeTaskReminder(
  store: TaskStore,
  args: TaskTargetArgs,
  context: FeatureExecutionContext,
): Promise<FeatureResult> {
  const selection = await selectEligibleTask(
    store,
    args,
    context,
    ["open", "completed"],
    {
      matches: (task) =>
        task.reminder?.status === "claimed" ||
        task.reminder?.status === "delivered",
      noMatchText:
        "I could not find one matching task reminder to acknowledge.",
    },
  );
  if ("result" in selection) return selection.result;
  const acknowledged = await store.acknowledgeReminder({
    acknowledgedAt: context.clock.now().toISOString(),
    expectedRevision: selection.task.revision,
    id: selection.task.id,
  });
  if (!acknowledged) {
    return {
      text: `${selection.task.label} changed before I could acknowledge its reminder.`,
    };
  }
  return acknowledgedReminderResult(selection.list, acknowledged);
}

function acknowledgedReminderResult(
  list: TaskListRecord,
  task: TaskRecord,
): FeatureResult {
  if (task.reminder?.status !== "acknowledged") {
    throw new Error("Task reminder acknowledgement returned invalid state.");
  }
  return {
    data: {
      acknowledgedAt: task.reminder.acknowledgedAt,
      id: task.id,
      label: task.label,
      listId: list.id,
      listName: list.name,
      reminderAt: task.reminder.scheduledFor,
      reminderStatus: task.reminder.status,
      revision: task.revision,
      status: task.status,
    },
    text: `Acknowledged the reminder for ${task.label} on your ${list.name} list.`,
  };
}
