import {
  assertValidTaskListRecord,
  normalizeTaskListName,
} from "../../application/task-policy.js";
import type {
  NewTaskList,
  RenameTaskListRequest,
  TaskListRecord,
} from "../../ports/task-store.js";

export function createTaskListRecord(
  list: NewTaskList,
  id: string,
  now: Date,
): TaskListRecord {
  const timestamp = now.toISOString();
  const record: TaskListRecord = {
    createdAt: timestamp,
    id,
    name: normalizeTaskListName(list.name),
    revision: 1,
    updatedAt: timestamp,
  };
  assertValidTaskListRecord(record);
  return record;
}

export function applyTaskListRename(
  list: TaskListRecord,
  request: RenameTaskListRequest,
): TaskListRecord | undefined {
  if (list.id !== request.id || list.revision !== request.expectedRevision) {
    return;
  }
  const renamed: TaskListRecord = {
    ...list,
    name: normalizeTaskListName(request.name),
    revision: list.revision + 1,
    updatedAt: request.updatedAt,
  };
  assertValidTaskListRecord(renamed);
  return renamed;
}
