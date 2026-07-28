import {
  defineCapability,
  type FeatureArgsFromParameters,
  type FeatureCapabilityParameters,
  type FeatureResult,
} from "../../ports/feature.js";
import { normalizeTaskListName } from "../../ports/task-policy.js";
import type { TaskStore } from "../../ports/task-store.js";
import { selectTaskList } from "./task-selection.js";
import { taskSpokenSummary } from "./task-capability-metadata.js";

const clearTaskListParameters = {
  listName: { required: true, type: "string" },
} as const satisfies FeatureCapabilityParameters;
type ClearTaskListArgs = FeatureArgsFromParameters<
  typeof clearTaskListParameters
>;

export function createTaskListClearCapability(store: TaskStore) {
  return defineCapability({
    confirmation: (args) => clearTaskListConfirmation(args),
    description:
      "Permanently remove every task from one exact named personal list. This requires confirmation.",
    execute: (request) => clearTaskList(store, request.args),
    parameters: clearTaskListParameters,
    requiresConfirmation: true,
    risk: "high",
    spokenSummary: taskSpokenSummary,
    summary: "Permanently clear one exact personal list.",
  });
}

function clearTaskListConfirmation(args: ClearTaskListArgs) {
  const listName = normalizeTaskListName(args.listName);
  return {
    facts: { listName },
    text: `clear every task from the ${listName} list`,
  };
}

async function clearTaskList(
  store: TaskStore,
  args: ClearTaskListArgs,
): Promise<FeatureResult> {
  const listName = normalizeTaskListName(args.listName);
  const [lists, tasks] = await Promise.all([
    store.listLists(),
    store.listTasks(),
  ]);
  const list = selectTaskList(lists, listName);
  if (!list) {
    return { text: `I could not find a list named ${listName}.` };
  }
  const selectedTasks = tasks.filter((task) => task.listId === list.id);
  if (selectedTasks.length === 0) {
    return {
      data: { listId: list.id, listName: list.name, removedCount: 0 },
      text: `Your ${list.name} list is already empty.`,
    };
  }
  const cleared = await store.clearList({
    expectedListRevision: list.revision,
    listId: list.id,
    tasks: selectedTasks.map(({ id, revision }) => ({ id, revision })),
  });
  if (!cleared) {
    return {
      text: `Your ${list.name} list changed before I could clear it.`,
    };
  }
  return clearedTaskListResult(
    cleared.list.id,
    cleared.list.name,
    cleared.removed.length,
  );
}

function clearedTaskListResult(
  listId: string,
  listName: string,
  removedCount: number,
): FeatureResult {
  return {
    data: { listId, listName, removedCount },
    text: `Cleared ${removedCount} tasks from your ${listName} list.`,
  };
}
