import { cloneTaskRecord } from "../../ports/task-policy.js";
import type {
  TaskListRecord,
  TaskRecord,
  TaskStore,
} from "../../ports/task-store.js";
import {
  applyTaskListRename,
  createTaskListRecord,
} from "./task-list-record.js";
import { applyTaskUpdate, createTaskRecord } from "./task-record.js";
import {
  assertTaskCapacity,
  assertTaskListCapacity,
  assertUniqueTaskListName,
  assertUniqueTaskStoreId,
  cloneTaskList,
} from "./task-store-state.js";

interface InMemoryTaskStoreOptions {
  createListId?: () => string;
  createTaskId?: () => string;
  now: () => Date;
}

export function createInMemoryTaskStore(
  options: InMemoryTaskStoreOptions,
): TaskStore {
  const lists: TaskListRecord[] = [];
  const tasks: TaskRecord[] = [];
  const createListId =
    options.createListId ?? (() => `task-list-${lists.length + 1}`);
  const createTaskId =
    options.createTaskId ?? (() => `task-${tasks.length + 1}`);

  return {
    addList: (input) =>
      Promise.resolve().then(() => {
        assertTaskListCapacity(lists);
        const name = assertUniqueTaskListName(lists, input.name);
        const id = createListId();
        assertUniqueTaskStoreId(lists, id, "Task list");
        const list = createTaskListRecord({ name }, id, options.now());
        lists.push(list);
        return cloneTaskList(list);
      }),
    addTask: (input) =>
      Promise.resolve().then(() => {
        assertTaskCapacity(tasks);
        if (!lists.some((list) => list.id === input.listId)) {
          throw new Error(`Task list ${input.listId} does not exist.`);
        }
        const id = createTaskId();
        assertUniqueTaskStoreId(tasks, id, "Task");
        const task = createTaskRecord(input, id, options.now());
        tasks.push(task);
        return cloneTaskRecord(task);
      }),
    listLists: () => Promise.resolve(lists.map(cloneTaskList)),
    listTasks: () => Promise.resolve(tasks.map(cloneTaskRecord)),
    removeTask: (request) =>
      Promise.resolve().then(() => {
        const index = tasks.findIndex((task) => task.id === request.id);
        const current = tasks[index];
        if (!current || current.revision !== request.expectedRevision) return;
        tasks.splice(index, 1);
        return cloneTaskRecord(current);
      }),
    renameList: (request) =>
      Promise.resolve().then(() => {
        const index = lists.findIndex((list) => list.id === request.id);
        const current = lists[index];
        if (!current || current.revision !== request.expectedRevision) return;
        const name = assertUniqueTaskListName(lists, request.name, current.id);
        const renamed = applyTaskListRename(current, { ...request, name });
        if (!renamed) return;
        lists[index] = renamed;
        return cloneTaskList(renamed);
      }),
    updateTask: (request) =>
      Promise.resolve().then(() => {
        const index = tasks.findIndex((task) => task.id === request.id);
        const current = tasks[index];
        if (!current) return;
        const updated = applyTaskUpdate(current, request);
        if (!updated) return;
        tasks[index] = updated;
        return cloneTaskRecord(updated);
      }),
  };
}
