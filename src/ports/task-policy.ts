import type { TaskListRecord, TaskRecord, TaskReminder } from "./task-store.js";
import {
  isCanonicalIsoDate,
  isCanonicalIsoTimestamp,
} from "../application/temporal-policy.js";

const maxListNameLength = 100;
const maxTaskLabelLength = 200;
const maxTaskNoteLength = 2_000;

export function assertValidTaskListRecord(list: TaskListRecord): void {
  if (
    !isIdentifier(list.id) ||
    !isBoundedTrimmedText(list.name, maxListNameLength) ||
    normalizeTaskListName(list.name) !== list.name ||
    !hasCanonicalRecordMetadata(list)
  ) {
    throw new Error("Task list state is invalid.");
  }
}

export function assertValidTaskRecord(task: TaskRecord): void {
  if (
    !isIdentifier(task.id) ||
    !isIdentifier(task.listId) ||
    !isBoundedTrimmedText(task.label, maxTaskLabelLength) ||
    normalizeTaskLabel(task.label) !== task.label ||
    (task.note !== undefined &&
      (!isBoundedTrimmedText(task.note, maxTaskNoteLength) ||
        normalizeTaskNote(task.note) !== task.note)) ||
    (task.dueDate !== undefined && !isCanonicalIsoDate(task.dueDate)) ||
    !hasCanonicalRecordMetadata(task) ||
    !hasCanonicalTaskLifecycle(task) ||
    (task.reminder !== undefined &&
      !hasCanonicalReminderLifecycle(task.reminder, task))
  ) {
    throw new Error("Task state is invalid.");
  }
}

export function cloneTaskRecord(task: TaskRecord): TaskRecord {
  return {
    ...task,
    ...(task.reminder ? { reminder: { ...task.reminder } } : {}),
  };
}

export function taskReminderTerminalTimestamp(
  reminder: TaskReminder | undefined,
): string | undefined {
  switch (reminder?.status) {
    case "acknowledged":
      return reminder.acknowledgedAt;
    case "cancelled":
      return reminder.cancelledAt;
    case "delivered":
      return reminder.deliveredAt;
    case "claimed":
    case "scheduled":
    case undefined:
      return;
  }
}

export function normalizeTaskListName(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function normalizeTaskLabel(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function normalizeTaskNote(
  value: string | undefined,
): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function hasCanonicalRecordMetadata(record: {
  createdAt: string;
  revision: number;
  updatedAt: string;
}): boolean {
  return (
    isCanonicalIsoTimestamp(record.createdAt) &&
    isCanonicalIsoTimestamp(record.updatedAt) &&
    record.updatedAt >= record.createdAt &&
    Number.isInteger(record.revision) &&
    record.revision >= 1
  );
}

function hasCanonicalTaskLifecycle(task: TaskRecord): boolean {
  return task.status === "open"
    ? task.completedAt === undefined
    : task.status === "completed" &&
        isCanonicalIsoTimestamp(task.completedAt) &&
        task.completedAt >= task.createdAt &&
        task.completedAt <= task.updatedAt &&
        task.reminder?.status !== "scheduled";
}

function hasCanonicalReminderLifecycle(
  reminder: TaskReminder,
  task: TaskRecord,
): boolean {
  if (
    !isCanonicalIsoTimestamp(reminder.scheduledFor) ||
    reminder.scheduledFor <= task.createdAt
  ) {
    return false;
  }

  switch (reminder.status) {
    case "scheduled":
      return hasOnlyLifecycleFields(reminder, []);
    case "claimed":
      return (
        reminder.claimedAt >= reminder.scheduledFor &&
        reminder.claimedAt <= task.updatedAt &&
        isCanonicalIsoTimestamp(reminder.claimedAt) &&
        hasOnlyLifecycleFields(reminder, ["claimedAt"])
      );
    case "delivered":
      return (
        reminder.claimedAt >= reminder.scheduledFor &&
        reminder.deliveredAt >= reminder.claimedAt &&
        reminder.deliveredAt <= task.updatedAt &&
        isCanonicalIsoTimestamp(reminder.claimedAt) &&
        isCanonicalIsoTimestamp(reminder.deliveredAt) &&
        hasOnlyLifecycleFields(reminder, ["claimedAt", "deliveredAt"])
      );
    case "acknowledged":
      return (
        reminder.claimedAt >= reminder.scheduledFor &&
        (reminder.deliveredAt === undefined ||
          (reminder.deliveredAt >= reminder.claimedAt &&
            isCanonicalIsoTimestamp(reminder.deliveredAt))) &&
        reminder.acknowledgedAt >=
          (reminder.deliveredAt ?? reminder.claimedAt) &&
        reminder.acknowledgedAt <= task.updatedAt &&
        isCanonicalIsoTimestamp(reminder.claimedAt) &&
        isCanonicalIsoTimestamp(reminder.acknowledgedAt) &&
        hasOnlyLifecycleFields(reminder, [
          "acknowledgedAt",
          "claimedAt",
          ...(reminder.deliveredAt === undefined
            ? []
            : ["deliveredAt" as const]),
        ])
      );
    case "cancelled":
      return (
        reminder.cancelledAt >= task.createdAt &&
        reminder.cancelledAt <= task.updatedAt &&
        isCanonicalIsoTimestamp(reminder.cancelledAt) &&
        hasOnlyLifecycleFields(reminder, ["cancelledAt"])
      );
  }
}

const lifecycleFields = [
  "acknowledgedAt",
  "cancelledAt",
  "claimedAt",
  "deliveredAt",
] as const;

function hasOnlyLifecycleFields(
  reminder: TaskReminder,
  expected: readonly (typeof lifecycleFields)[number][],
): boolean {
  const value = reminder as unknown as Record<string, unknown>;
  return lifecycleFields.every(
    (field) => (value[field] !== undefined) === expected.includes(field),
  );
}

function isIdentifier(value: string): boolean {
  return isBoundedTrimmedText(value, 200);
}

function isBoundedTrimmedText(value: string, maxLength: number): boolean {
  return (
    value.length > 0 && value.length <= maxLength && value.trim() === value
  );
}
