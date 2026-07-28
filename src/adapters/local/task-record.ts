import {
  assertValidTaskRecord,
  normalizeTaskLabel,
  normalizeTaskNote,
} from "../../ports/task-policy.js";
import type {
  NewTask,
  TaskRecord,
  TaskReminder,
} from "../../ports/task-store.js";

export function createTaskRecord(
  input: NewTask,
  id: string,
  now: Date,
): TaskRecord {
  const timestamp = now.toISOString();
  const reminder = createScheduledReminder(input.reminderAt, timestamp);
  const note = normalizeTaskNote(input.note);
  const task: TaskRecord = {
    createdAt: timestamp,
    ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }),
    id,
    label: normalizeTaskLabel(input.label),
    listId: input.listId,
    ...(note === undefined ? {} : { note }),
    ...(reminder === undefined ? {} : { reminder }),
    revision: 1,
    status: "open",
    updatedAt: timestamp,
  };
  assertValidTaskRecord(task);
  return task;
}

function createScheduledReminder(
  reminderAt: string | undefined,
  createdAt: string,
): TaskReminder | undefined {
  if (reminderAt === undefined) return;
  if (reminderAt <= createdAt) {
    throw new Error("A new task reminder must be in the future.");
  }
  return {
    scheduledFor: reminderAt,
    status: "scheduled",
  };
}
