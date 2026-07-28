import {
  defineCapability,
  defineFeature,
  type FeatureArgsFromParameters,
  type FeatureCapabilityParameters,
  type FeatureExecutionContext,
  type FeatureResult,
} from "../../ports/feature.js";
import { normalizeTaskListName } from "../../ports/task-policy.js";
import type {
  TaskListRecord,
  TaskRecord,
  TaskStore,
} from "../../ports/task-store.js";

const maxDisplayedItems = 10;

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

export function createTaskFeature(store: TaskStore) {
  return defineFeature({
    capabilities: {
      "task.list.create": defineCapability({
        description: "Create one durable named personal task list.",
        execute: (request) => createList(store, request.args),
        parameters: createListParameters,
        risk: "low",
        spokenSummary: "create personal lists",
        summary: "Create a named personal list.",
      }),
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
    },
    displayName: "Lists and Tasks",
    id: "tasks",
  });
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
  const list = selectList(lists, requestedName);
  if (!list) {
    return { text: `I could not find a list named ${requestedName}.` };
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
  const list = selectList(lists, requestedName);
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

function availableListsResult(lists: readonly TaskListRecord[]): FeatureResult {
  if (lists.length === 0)
    return { text: "You do not have any personal lists." };
  const shown = lists.slice(0, maxDisplayedItems);
  const data = Object.fromEntries(
    shown.flatMap((list, index) => [
      [`list${index}Id`, list.id],
      [`list${index}Name`, list.name],
    ]),
  );
  return {
    data: {
      ...data,
      listCount: lists.length,
      ...(shown.length < lists.length
        ? { visibleListCount: shown.length }
        : {}),
    },
    text: `You have ${joinHuman(
      shown.map((list) => list.name),
    )} lists${remainingSuffix(lists.length, shown.length)}.`,
  };
}

function taskListResult(
  list: TaskListRecord,
  tasks: readonly TaskRecord[],
): FeatureResult {
  if (tasks.length === 0) {
    return {
      data: { listId: list.id, listName: list.name, taskCount: 0 },
      text: `Your ${list.name} list is empty.`,
    };
  }
  const shown = tasks.slice(0, maxDisplayedItems);
  const data = Object.fromEntries(
    shown.flatMap((task, index) => [
      [`task${index}Id`, task.id],
      [`task${index}Label`, task.label],
      [`task${index}Status`, task.status],
    ]),
  );
  return {
    data: {
      listId: list.id,
      listName: list.name,
      ...data,
      taskCount: tasks.length,
      ...(shown.length < tasks.length
        ? { visibleTaskCount: shown.length }
        : {}),
    },
    text: `Your ${list.name} list has ${joinHuman(
      shown.map((task) => task.label),
    )}${remainingSuffix(tasks.length, shown.length)}.`,
  };
}

function selectList(
  lists: readonly TaskListRecord[],
  name: string,
): TaskListRecord | undefined {
  const canonicalName = name.toLocaleLowerCase("en");
  return lists.find(
    (list) => list.name.toLocaleLowerCase("en") === canonicalName,
  );
}

function joinHuman(values: readonly string[]): string {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function remainingSuffix(total: number, visible: number): string {
  const remaining = total - visible;
  return remaining > 0 ? `, plus ${remaining} more` : "";
}
