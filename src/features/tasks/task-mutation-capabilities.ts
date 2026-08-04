import type { AssistantContext } from "../../ports/assistant.js";
import {
  defineCapability,
  type FeatureArgsFromParameters,
  type FeatureCapabilityParameters,
  type FeatureExecutionContext,
  type FeatureResult,
} from "../../application/feature.js";
import {
  normalizeTaskLabel,
  normalizeTaskListName,
  normalizeTaskNote,
} from "../../application/task-policy.js";
import type {
  TaskListRecord,
  TaskRecord,
  TaskStore,
  UpdateTaskRequest,
} from "../../ports/task-store.js";
import {
  selectEligibleTask,
  taskTargetParameters,
  type TaskTargetArgs,
} from "./task-selection.js";
import { taskSpokenSummary } from "./task-capability-metadata.js";

const editTaskParameters = {
  ...taskTargetParameters,
  clearDueDate: { type: "boolean" },
  clearNote: { type: "boolean" },
  newDueDate: { type: "string" },
  newLabel: { type: "string" },
  newNote: { type: "string" },
} as const satisfies FeatureCapabilityParameters;
type EditTaskArgs = FeatureArgsFromParameters<typeof editTaskParameters>;

export function createTaskMutationCapabilities(store: TaskStore) {
  return {
    "task.edit": defineCapability({
      description:
        "Edit one task's label, note, or due date without changing reminder delivery state.",
      execute: (request, context) => editTask(store, request.args, context),
      parameters: editTaskParameters,
      risk: "low",
      spokenSummary: taskSpokenSummary,
      summary: "Edit one task's label, note, or due date.",
    }),
    "task.remove": defineCapability({
      confirmation: (args, context) => removeTaskConfirmation(args, context),
      description:
        "Permanently remove one exact task. This requires confirmation.",
      execute: (request, context) => removeTask(store, request.args, context),
      parameters: taskTargetParameters,
      requiresConfirmation: true,
      risk: "high",
      spokenSummary: taskSpokenSummary,
      summary: "Permanently remove one exact task.",
    }),
  };
}

async function editTask(
  store: TaskStore,
  args: EditTaskArgs,
  context: FeatureExecutionContext,
): Promise<FeatureResult> {
  const selection = await selectEligibleTask(store, args, context, [
    "open",
    "completed",
  ]);
  if ("result" in selection) return selection.result;
  const changes = taskEdits(args);
  const updated = await store.updateTask({
    changes,
    expectedRevision: selection.task.revision,
    id: selection.task.id,
    updatedAt: context.clock.now().toISOString(),
  });
  if (!updated) {
    return {
      text: `${selection.task.label} changed before I could update it.`,
    };
  }
  return editedTaskResult(selection.list, updated);
}

function taskEdits(args: EditTaskArgs): UpdateTaskRequest["changes"] {
  if (args.clearDueDate && args.newDueDate !== undefined) {
    throw new Error("A task edit cannot set and clear its due date.");
  }
  if (args.clearNote && args.newNote !== undefined) {
    throw new Error("A task edit cannot set and clear its note.");
  }
  const changes: UpdateTaskRequest["changes"] = {};
  if (args.clearDueDate) changes.dueDate = null;
  else if (args.newDueDate) changes.dueDate = args.newDueDate;
  if (args.newLabel) changes.label = normalizeTaskLabel(args.newLabel);
  if (args.clearNote) {
    changes.note = null;
  } else if (args.newNote) {
    const note = normalizeTaskNote(args.newNote);
    if (note) changes.note = note;
  }
  if (Object.keys(changes).length === 0) {
    throw new Error("A task edit requires at least one changed field.");
  }
  return changes;
}

function removeTaskConfirmation(
  args: TaskTargetArgs,
  context: AssistantContext,
) {
  const selected = context.selectResultReference?.({
    ...(args.ordinal === undefined ? {} : { ordinal: args.ordinal }),
    rawText: context.trustedInputText ?? "",
    ...(args.reference === undefined ? {} : { reference: args.reference }),
  });
  const facts =
    selected?.publicReference.kind === "task_item"
      ? selected.publicReference.facts
      : args.label && args.listName
        ? {
            label: normalizeTaskLabel(args.label),
            listName: normalizeTaskListName(args.listName),
          }
        : undefined;
  if (!facts) {
    throw new Error(
      "Task removal requires an exact retained reference or list and label.",
    );
  }
  return {
    facts: {
      ...(args.id ? { id: args.id } : {}),
      label: facts.label,
      listName: facts.listName,
      ...(args.ordinal === undefined ? {} : { ordinal: args.ordinal }),
      ...(args.reference === undefined ? {} : { reference: args.reference }),
    },
    text: `remove ${facts.label} from the ${facts.listName} list`,
  };
}

async function removeTask(
  store: TaskStore,
  args: TaskTargetArgs,
  context: FeatureExecutionContext,
): Promise<FeatureResult> {
  const selection = await selectEligibleTask(store, args, context, [
    "open",
    "completed",
  ]);
  if ("result" in selection) return selection.result;
  const removed = await store.removeTask({
    expectedRevision: selection.task.revision,
    id: selection.task.id,
  });
  if (!removed) {
    return {
      text: `${selection.task.label} changed before I could remove it.`,
    };
  }
  return {
    data: taskResultData(selection.list, removed),
    text: `Removed ${removed.label} from your ${selection.list.name} list.`,
  };
}

function editedTaskResult(
  list: TaskListRecord,
  task: TaskRecord,
): FeatureResult {
  return {
    data: taskResultData(list, task),
    text: `Updated ${task.label} on your ${list.name} list.`,
  };
}

function taskResultData(list: TaskListRecord, task: TaskRecord) {
  return {
    ...(task.completedAt ? { completedAt: task.completedAt } : {}),
    ...(task.dueDate ? { dueDate: task.dueDate } : {}),
    id: task.id,
    label: task.label,
    listId: list.id,
    listName: list.name,
    ...(task.note ? { note: task.note } : {}),
    ...(task.reminder ? { reminderStatus: task.reminder.status } : {}),
    revision: task.revision,
    status: task.status,
  };
}
