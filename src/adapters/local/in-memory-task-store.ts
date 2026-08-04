import { cloneTaskRecord } from "../../application/task-policy.js";
import type {
  TaskListRecord,
  TaskRecord,
  TaskStore,
} from "../../ports/task-store.js";
import {
  applyTaskListRename,
  createTaskListRecord,
} from "./task-list-record.js";
import {
  applyTaskReminderAcknowledgement,
  applyTaskReminderClaim,
  applyTaskReminderDelivery,
  applyTaskUpdate,
  clearTerminalTaskReminder,
  createTaskRecord,
} from "./task-record.js";
import {
  assertTaskCapacity,
  assertTaskListCapacity,
  assertUniqueTaskListName,
  assertUniqueTaskStoreId,
  cloneTaskList,
  matchesTaskListClearSnapshot,
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

  function updateStoredTask(
    id: string,
    update: (task: TaskRecord) => TaskRecord | undefined,
  ): Promise<TaskRecord | undefined> {
    return Promise.resolve().then(() => {
      const index = tasks.findIndex((task) => task.id === id);
      const current = tasks[index];
      if (!current) return;
      const updated = update(current);
      if (!updated) return;
      tasks[index] = updated;
      return cloneTaskRecord(updated);
    });
  }

  return {
    acknowledgeReminder: (request) =>
      updateStoredTask(request.id, (task) =>
        applyTaskReminderAcknowledgement(task, request),
      ),
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
    claimReminder: (request) =>
      updateStoredTask(request.id, (task) =>
        applyTaskReminderClaim(task, request),
      ),
    clearList: (request) =>
      Promise.resolve().then(() => {
        const list = lists.find((candidate) => candidate.id === request.listId);
        if (!list || !matchesTaskListClearSnapshot(list, tasks, request)) {
          return;
        }
        const removed = tasks.filter((task) => task.listId === list.id);
        for (let index = tasks.length - 1; index >= 0; index -= 1) {
          if (tasks[index]?.listId === list.id) tasks.splice(index, 1);
        }
        return {
          list: cloneTaskList(list),
          removed: removed.map(cloneTaskRecord),
        };
      }),
    clearTerminalRemindersBefore: (request) =>
      Promise.resolve().then(() => {
        let cleared = 0;
        for (let index = 0; index < tasks.length; index += 1) {
          const current = tasks[index];
          if (!current) continue;
          const updated = clearTerminalTaskReminder(current, request);
          if (!updated) continue;
          tasks[index] = updated;
          cleared += 1;
        }
        return cleared;
      }),
    listLists: () => Promise.resolve(lists.map(cloneTaskList)),
    listTasks: () => Promise.resolve(tasks.map(cloneTaskRecord)),
    markReminderDelivered: (request) =>
      updateStoredTask(request.id, (task) =>
        applyTaskReminderDelivery(task, request),
      ),
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
      updateStoredTask(request.id, (task) => applyTaskUpdate(task, request)),
  };
}
