import {
  defineCapability,
  defineFeature,
  type FeatureArgsFromParameters,
  type FeatureCapabilityParameters,
  type FeatureExecutionContext,
  type FeatureResult,
} from "../../ports/feature.js";
import type { AssistantContext } from "../../ports/assistant.js";
import {
  normalizeTaskLabel,
  normalizeTaskListName,
  normalizeTaskNote,
} from "../../ports/task-policy.js";
import type { TaskRecord, TaskStore } from "../../ports/task-store.js";
import { isCanonicalIsoTimestamp } from "../../ports/temporal-policy.js";
import {
  availableListsResult,
  createdTaskResult,
  emptyTaskReferences,
  taskListResult,
  taskStatusResult,
} from "./task-results.js";
import {
  selectEligibleTask,
  selectTaskList,
  taskTargetParameters,
  type TaskTargetArgs,
} from "./task-selection.js";
import { createTaskMutationCapabilities } from "./task-mutation-capabilities.js";
import { createTaskListClearCapability } from "./task-list-clear.js";
import { createTaskReminderAcknowledgementCapability } from "./task-reminder-capability.js";

const createListParameters = {
  name: { required: true, type: "string" },
} as const satisfies FeatureCapabilityParameters;
type CreateListArgs = FeatureArgsFromParameters<typeof createListParameters>;

const showListParameters = {
  name: { type: "string" },
} as const satisfies FeatureCapabilityParameters;
type ShowListArgs = FeatureArgsFromParameters<typeof showListParameters>;

const renameListParameters = {
  name: { required: true, type: "string" },
  newName: { required: true, type: "string" },
} as const satisfies FeatureCapabilityParameters;
type RenameListArgs = FeatureArgsFromParameters<typeof renameListParameters>;

const createTaskParameters = {
  dueDate: { type: "string" },
  label: { required: true, type: "string" },
  listName: { required: true, type: "string" },
  note: { type: "string" },
} as const satisfies FeatureCapabilityParameters;
type CreateTaskArgs = FeatureArgsFromParameters<typeof createTaskParameters>;

const remindTaskParameters = {
  ...createTaskParameters,
  reminderAt: { required: true, type: "string" },
} as const satisfies FeatureCapabilityParameters;
type RemindTaskArgs = FeatureArgsFromParameters<typeof remindTaskParameters>;

export function createTaskFeature(store: TaskStore) {
  return defineFeature({
    capabilities: {
      "task.complete": defineCapability({
        description:
          "Complete one eligible open task by exact ID, label, list, or retained task reference.",
        execute: (request, context) =>
          changeTaskStatus(store, request.args, context, "completed"),
        parameters: taskTargetParameters,
        risk: "low",
        spokenSummary: "complete personal tasks",
        summary: "Complete one open task.",
      }),
      "task.create": defineCapability({
        description:
          "Add one task with an optional note and due date to an exact named personal list.",
        execute: (request) => createTask(store, request.args),
        parameters: createTaskParameters,
        risk: "low",
        spokenSummary: "add tasks to personal lists",
        summary: "Add a task to a named personal list.",
      }),
      ...createTaskMutationCapabilities(store),
      "task.list.create": defineCapability({
        description: "Create one durable named personal task list.",
        execute: (request) => createList(store, request.args),
        parameters: createListParameters,
        risk: "low",
        spokenSummary: "create personal lists",
        summary: "Create a named personal list.",
      }),
      "task.list.clear": createTaskListClearCapability(store),
      "task.list.rename": defineCapability({
        description: "Rename one existing personal task list.",
        execute: (request, context) => renameList(store, request.args, context),
        parameters: renameListParameters,
        risk: "low",
        spokenSummary: "rename personal lists",
        summary: "Rename an existing personal list.",
      }),
      "task.list.show": defineCapability({
        description:
          "Show one named personal list, or list the available names when no name is supplied.",
        execute: (request) => showList(store, request.args),
        parameters: showListParameters,
        risk: "low",
        spokenSummary: "show personal lists and tasks",
        summary: "Show personal lists and their tasks.",
        toolChain: "read",
      }),
      "task.remind": defineCapability({
        confirmation: (args, context) => reminderConfirmation(args, context),
        description:
          "Add one task with an exact future reminder instant to a named personal list. This requires confirmation.",
        execute: (request) => createTask(store, request.args),
        parameters: remindTaskParameters,
        requiresConfirmation: true,
        risk: "high",
        spokenSummary: "create task reminders",
        summary: "Add a task with an exact reminder.",
      }),
      "task.reminder.acknowledge":
        createTaskReminderAcknowledgementCapability(store),
      "task.reopen": defineCapability({
        description:
          "Reopen one eligible completed task without reactivating any cancelled reminder.",
        execute: (request, context) =>
          changeTaskStatus(store, request.args, context, "open"),
        parameters: taskTargetParameters,
        risk: "low",
        spokenSummary: "reopen personal tasks",
        summary: "Reopen one completed task.",
      }),
    },
    displayName: "Lists and Tasks",
    id: "tasks",
  });
}

async function changeTaskStatus(
  store: TaskStore,
  args: TaskTargetArgs,
  context: FeatureExecutionContext,
  status: TaskRecord["status"],
): Promise<FeatureResult> {
  const selection = await selectEligibleTask(store, args, context, [
    status === "completed" ? "open" : "completed",
  ]);
  if ("result" in selection) return selection.result;
  const updated = await store.updateTask({
    changes: { status },
    expectedRevision: selection.task.revision,
    id: selection.task.id,
    updatedAt: context.clock.now().toISOString(),
  });
  if (!updated) {
    return {
      text: `${selection.task.label} changed before I could update it.`,
    };
  }
  return taskStatusResult(selection.list, updated);
}

async function createTask(
  store: TaskStore,
  args: CreateTaskArgs | RemindTaskArgs,
): Promise<FeatureResult> {
  const requestedListName = normalizeTaskListName(args.listName);
  const list = selectTaskList(await store.listLists(), requestedListName);
  if (!list) {
    return { text: `I could not find a list named ${requestedListName}.` };
  }
  const task = await store.addTask({
    ...(args.dueDate ? { dueDate: args.dueDate } : {}),
    label: args.label,
    listId: list.id,
    ...(args.note ? { note: args.note } : {}),
    ...("reminderAt" in args ? { reminderAt: args.reminderAt } : {}),
  });
  return createdTaskResult(list, task);
}

function reminderConfirmation(args: RemindTaskArgs, context: AssistantContext) {
  assertFutureReminder(args.reminderAt, context.clock.now());
  const label = normalizeTaskLabel(args.label);
  const listName = normalizeTaskListName(args.listName);
  const note = normalizeTaskNote(args.note);
  return {
    facts: {
      ...(args.dueDate ? { dueDate: args.dueDate } : {}),
      label,
      listName,
      ...(note ? { note } : {}),
      reminderAt: args.reminderAt,
    },
    text: `create ${label} on the ${listName} list with a reminder for ${args.reminderAt}`,
  };
}

function assertFutureReminder(reminderAt: string, now: Date): void {
  if (!isCanonicalIsoTimestamp(reminderAt) || reminderAt <= now.toISOString()) {
    throw new Error("A task reminder must be an exact future ISO timestamp.");
  }
}

async function createList(
  store: TaskStore,
  args: CreateListArgs,
): Promise<FeatureResult> {
  const list = await store.addList({ name: args.name });
  return {
    data: { id: list.id, name: list.name, revision: list.revision },
    text: `Created the ${list.name} list.`,
  };
}

async function showList(
  store: TaskStore,
  args: ShowListArgs,
): Promise<FeatureResult> {
  const lists = await store.listLists();
  if (args.name === undefined) return availableListsResult(lists);
  const requestedName = normalizeTaskListName(args.name);
  const list = selectTaskList(lists, requestedName);
  if (!list) {
    return {
      resultReferences: emptyTaskReferences(),
      text: `I could not find a list named ${requestedName}.`,
    };
  }
  const tasks = (await store.listTasks()).filter(
    (task) => task.listId === list.id,
  );
  return taskListResult(list, tasks);
}

async function renameList(
  store: TaskStore,
  args: RenameListArgs,
  context: FeatureExecutionContext,
): Promise<FeatureResult> {
  const lists = await store.listLists();
  const requestedName = normalizeTaskListName(args.name);
  const list = selectTaskList(lists, requestedName);
  if (!list) {
    return { text: `I could not find a list named ${requestedName}.` };
  }
  const renamed = await store.renameList({
    expectedRevision: list.revision,
    id: list.id,
    name: args.newName,
    updatedAt: context.clock.now().toISOString(),
  });
  if (!renamed) {
    return { text: `The ${list.name} list changed before I could rename it.` };
  }
  return {
    data: {
      id: renamed.id,
      name: renamed.name,
      revision: renamed.revision,
    },
    text: `Renamed the ${list.name} list to ${renamed.name}.`,
  };
}
