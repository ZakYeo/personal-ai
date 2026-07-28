import { normalizeTaskListName } from "../../ports/task-policy.js";
import type {
  ClearTaskListRequest,
  TaskListRecord,
  TaskRecord,
} from "../../ports/task-store.js";

export const maxTaskLists = 100;
export const maxTasks = 1_000;

export function assertTaskListCapacity(lists: readonly TaskListRecord[]): void {
  if (lists.length >= maxTaskLists) {
    throw new Error(
      `Task state cannot contain more than ${maxTaskLists} lists.`,
    );
  }
}

export function assertTaskCapacity(tasks: readonly TaskRecord[]): void {
  if (tasks.length >= maxTasks) {
    throw new Error(`Task state cannot contain more than ${maxTasks} tasks.`);
  }
}

export function assertUniqueTaskListName(
  lists: readonly TaskListRecord[],
  requestedName: string,
  exceptId?: string,
): string {
  const normalized = normalizeTaskListName(requestedName);
  const canonicalName = normalized.toLocaleLowerCase("en");
  if (
    lists.some(
      (list) =>
        list.id !== exceptId &&
        list.name.toLocaleLowerCase("en") === canonicalName,
    )
  ) {
    throw new Error(`A task list named "${normalized}" already exists.`);
  }
  return normalized;
}

export function assertUniqueTaskStoreId(
  records: readonly { id: string }[],
  id: string,
  label: string,
): void {
  if (id.length === 0 || records.some((record) => record.id === id)) {
    throw new Error(`${label} ID ${id} already exists or is invalid.`);
  }
}

export function cloneTaskList(list: TaskListRecord): TaskListRecord {
  return { ...list };
}

export function matchesTaskListClearSnapshot(
  list: TaskListRecord,
  tasks: readonly TaskRecord[],
  request: ClearTaskListRequest,
): boolean {
  if (
    list.id !== request.listId ||
    list.revision !== request.expectedListRevision
  ) {
    return false;
  }
  const currentTasks = tasks.filter((task) => task.listId === list.id);
  if (currentTasks.length !== request.tasks.length) return false;
  const expectedRevisions = new Map(
    request.tasks.map(({ id, revision }) => [id, revision]),
  );
  return currentTasks.every(
    (task) => expectedRevisions.get(task.id) === task.revision,
  );
}
