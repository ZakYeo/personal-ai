import {
  assertValidTaskListRecord,
  assertValidTaskRecord,
} from "../../application/task-policy.js";
import type {
  TaskListRecord,
  TaskRecord,
  TaskReminder,
  TaskStatus,
} from "../../ports/task-store.js";
import { isRecord } from "../parsing.js";
import { maxTaskLists, maxTasks } from "./task-store-state.js";

export interface TaskStateDocument {
  lists: TaskListRecord[];
  tasks: TaskRecord[];
  version: 2;
}

const taskStatuses = new Set<TaskStatus>(["completed", "open"]);

export function parseTaskState(value: unknown): TaskStateDocument {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) {
    throw new Error("Task state has an unsupported version.");
  }
  if (!Array.isArray(value.lists) || !Array.isArray(value.tasks)) {
    throw invalidTaskState();
  }
  const version = value.version;
  const state: TaskStateDocument = {
    lists: value.lists.map(parseTaskList),
    tasks: value.tasks.map((task) => parseTask(task, version)),
    version: 2,
  };
  assertValidTaskStateDocument(state);
  return state;
}

export function assertValidTaskStateDocument(state: TaskStateDocument): void {
  if (state.lists.length > maxTaskLists) {
    throw new Error(
      `Task state cannot contain more than ${maxTaskLists} lists.`,
    );
  }
  if (state.tasks.length > maxTasks) {
    throw new Error(`Task state cannot contain more than ${maxTasks} tasks.`);
  }

  const listIds = new Set<string>();
  const listNames = new Set<string>();
  for (const list of state.lists) {
    if (listIds.has(list.id)) {
      throw new Error("Task state contains duplicate task list IDs.");
    }
    listIds.add(list.id);
    const canonicalName = list.name.toLocaleLowerCase("en");
    if (listNames.has(canonicalName)) {
      throw new Error("Task state contains duplicate task list names.");
    }
    listNames.add(canonicalName);
    try {
      assertValidTaskListRecord(list);
    } catch (cause) {
      throw new Error("Task state contains invalid task list state.", {
        cause,
      });
    }
  }

  const taskIds = new Set<string>();
  for (const task of state.tasks) {
    if (taskIds.has(task.id)) {
      throw new Error("Task state contains duplicate task IDs.");
    }
    taskIds.add(task.id);
    if (!listIds.has(task.listId)) {
      throw new Error("Task state references a missing task list.");
    }
    try {
      assertValidTaskRecord(task);
    } catch (cause) {
      throw new Error("Task state contains invalid task state.", { cause });
    }
  }
}

function parseTaskList(value: unknown): TaskListRecord {
  if (
    !isRecord(value) ||
    !isString(value.createdAt) ||
    !isString(value.id) ||
    !isString(value.name) ||
    !isInteger(value.revision) ||
    !isString(value.updatedAt)
  ) {
    throw invalidTaskListState();
  }
  return {
    createdAt: value.createdAt,
    id: value.id,
    name: value.name,
    revision: value.revision,
    updatedAt: value.updatedAt,
  };
}

function parseTask(value: unknown, version: 1 | 2): TaskRecord {
  if (
    !isRecord(value) ||
    !isString(value.createdAt) ||
    !isString(value.id) ||
    !isString(value.label) ||
    !isString(value.listId) ||
    !isInteger(value.revision) ||
    !isTaskStatus(value.status) ||
    !isString(value.updatedAt) ||
    (value.completedAt !== undefined && !isString(value.completedAt)) ||
    (value.dueDate !== undefined && !isString(value.dueDate)) ||
    (value.note !== undefined && !isString(value.note)) ||
    (version === 1 && value.reminder !== undefined)
  ) {
    throw invalidTaskState();
  }
  return {
    ...(value.completedAt === undefined
      ? {}
      : { completedAt: value.completedAt }),
    createdAt: value.createdAt,
    ...(value.dueDate === undefined ? {} : { dueDate: value.dueDate }),
    id: value.id,
    label: value.label,
    listId: value.listId,
    ...(value.note === undefined ? {} : { note: value.note }),
    ...(value.reminder === undefined
      ? {}
      : { reminder: parseReminder(value.reminder) }),
    revision: value.revision,
    status: value.status,
    updatedAt: value.updatedAt,
  };
}

function parseReminder(value: unknown): TaskReminder {
  if (
    !isRecord(value) ||
    !isString(value.scheduledFor) ||
    !isString(value.status)
  ) {
    throw invalidTaskState();
  }
  switch (value.status) {
    case "scheduled":
      assertOnlyReminderLifecycleFields(value, []);
      return { scheduledFor: value.scheduledFor, status: "scheduled" };
    case "claimed":
      if (!isString(value.claimedAt)) throw invalidTaskState();
      assertOnlyReminderLifecycleFields(value, ["claimedAt"]);
      return {
        claimedAt: value.claimedAt,
        scheduledFor: value.scheduledFor,
        status: "claimed",
      };
    case "delivered":
      if (!isString(value.claimedAt) || !isString(value.deliveredAt)) {
        throw invalidTaskState();
      }
      assertOnlyReminderLifecycleFields(value, ["claimedAt", "deliveredAt"]);
      return {
        claimedAt: value.claimedAt,
        deliveredAt: value.deliveredAt,
        scheduledFor: value.scheduledFor,
        status: "delivered",
      };
    case "acknowledged":
      if (
        !isString(value.acknowledgedAt) ||
        !isString(value.claimedAt) ||
        (value.deliveredAt !== undefined && !isString(value.deliveredAt))
      ) {
        throw invalidTaskState();
      }
      assertOnlyReminderLifecycleFields(value, [
        "acknowledgedAt",
        "claimedAt",
        ...(value.deliveredAt === undefined ? [] : ["deliveredAt" as const]),
      ]);
      return {
        acknowledgedAt: value.acknowledgedAt,
        claimedAt: value.claimedAt,
        ...(value.deliveredAt === undefined
          ? {}
          : { deliveredAt: value.deliveredAt }),
        scheduledFor: value.scheduledFor,
        status: "acknowledged",
      };
    case "cancelled":
      if (!isString(value.cancelledAt)) throw invalidTaskState();
      assertOnlyReminderLifecycleFields(value, ["cancelledAt"]);
      return {
        cancelledAt: value.cancelledAt,
        scheduledFor: value.scheduledFor,
        status: "cancelled",
      };
    default:
      throw invalidTaskState();
  }
}

const reminderLifecycleFields = [
  "acknowledgedAt",
  "cancelledAt",
  "claimedAt",
  "deliveredAt",
] as const;

function assertOnlyReminderLifecycleFields(
  reminder: Record<string, unknown>,
  expected: readonly (typeof reminderLifecycleFields)[number][],
): void {
  if (
    reminderLifecycleFields.some(
      (field) => (reminder[field] !== undefined) !== expected.includes(field),
    )
  ) {
    throw invalidTaskState();
  }
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && taskStatuses.has(value as TaskStatus);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function invalidTaskListState(): Error {
  return new Error("Task state contains invalid task list state.");
}

function invalidTaskState(): Error {
  return new Error("Task state contains invalid task state.");
}
