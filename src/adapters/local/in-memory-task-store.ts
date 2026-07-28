import { normalizeTaskListName } from "../../ports/task-policy.js";
import type { TaskListRecord, TaskStore } from "../../ports/task-store.js";
import {
  applyTaskListRename,
  createTaskListRecord,
} from "./task-list-record.js";

const maxTaskLists = 100;

interface InMemoryTaskStoreOptions {
  createListId?: () => string;
  now: () => Date;
}

export function createInMemoryTaskStore(
  options: InMemoryTaskStoreOptions,
): TaskStore {
  const lists: TaskListRecord[] = [];
  const createListId =
    options.createListId ?? (() => `task-list-${lists.length + 1}`);

  return {
    addList: (input) =>
      Promise.resolve().then(() => {
        if (lists.length >= maxTaskLists) {
          throw new Error(
            `Task state cannot contain more than ${maxTaskLists} lists.`,
          );
        }
        const name = normalizeTaskListName(input.name);
        assertUniqueListName(lists, name);
        const list = createTaskListRecord(
          { name },
          createListId(),
          options.now(),
        );
        lists.push(list);
        return cloneTaskList(list);
      }),
    listLists: () => Promise.resolve(lists.map(cloneTaskList)),
    renameList: (request) =>
      Promise.resolve().then(() => {
        const index = lists.findIndex((list) => list.id === request.id);
        const current = lists[index];
        if (!current || current.revision !== request.expectedRevision) return;
        const name = normalizeTaskListName(request.name);
        assertUniqueListName(lists, name, current.id);
        const renamed = applyTaskListRename(current, { ...request, name });
        if (!renamed) return;
        lists[index] = renamed;
        return cloneTaskList(renamed);
      }),
  };
}

function assertUniqueListName(
  lists: readonly TaskListRecord[],
  requestedName: string,
  exceptId?: string,
): void {
  const canonicalName = requestedName.toLocaleLowerCase("en");
  if (
    lists.some(
      (list) =>
        list.id !== exceptId &&
        list.name.toLocaleLowerCase("en") === canonicalName,
    )
  ) {
    throw new Error(`A task list named "${requestedName}" already exists.`);
  }
}

function cloneTaskList(list: TaskListRecord): TaskListRecord {
  return { ...list };
}
