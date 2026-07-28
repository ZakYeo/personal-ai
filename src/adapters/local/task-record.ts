import {
  assertValidTaskRecord,
  normalizeTaskLabel,
  normalizeTaskNote,
} from "../../ports/task-policy.js";
import type {
  AcknowledgeTaskReminderRequest,
  ClaimTaskReminderRequest,
  ClearTerminalTaskRemindersRequest,
  DeliverTaskReminderRequest,
  NewTask,
  TaskRecord,
  TaskReminder,
  UpdateTaskRequest,
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

export function applyTaskUpdate(
  task: TaskRecord,
  request: UpdateTaskRequest,
): TaskRecord | undefined {
  if (task.id !== request.id || task.revision !== request.expectedRevision) {
    return;
  }
  const requestedStatus = request.changes.status ?? task.status;
  if (
    requestedStatus === "completed" &&
    typeof request.changes.reminderAt === "string"
  ) {
    throw new Error("A completed task cannot schedule a reminder.");
  }

  const updated: TaskRecord = {
    ...task,
    ...(request.changes.label === undefined
      ? {}
      : { label: normalizeTaskLabel(request.changes.label) }),
    revision: task.revision + 1,
    status: request.changes.status ?? task.status,
    updatedAt: request.updatedAt,
  };
  applyOptionalFieldEdits(updated, request);
  applyTaskStatusTransition(updated, task, request);
  applyReminderEdit(updated, task, request);
  assertValidTaskRecord(updated);
  return updated;
}

export function applyTaskReminderClaim(
  task: TaskRecord,
  request: ClaimTaskReminderRequest,
): TaskRecord | undefined {
  if (
    task.id !== request.id ||
    task.revision !== request.expectedRevision ||
    task.reminder?.status !== "scheduled"
  ) {
    return;
  }
  if (request.claimedAt < task.reminder.scheduledFor) {
    throw new Error("A task reminder cannot be claimed before it is due.");
  }
  return updateReminder(task, request.claimedAt, {
    claimedAt: request.claimedAt,
    scheduledFor: task.reminder.scheduledFor,
    status: "claimed",
  });
}

export function applyTaskReminderDelivery(
  task: TaskRecord,
  request: DeliverTaskReminderRequest,
): TaskRecord | undefined {
  if (
    task.id !== request.id ||
    task.revision !== request.expectedRevision ||
    task.reminder?.status !== "claimed"
  ) {
    return;
  }
  return updateReminder(task, request.deliveredAt, {
    claimedAt: task.reminder.claimedAt,
    deliveredAt: request.deliveredAt,
    scheduledFor: task.reminder.scheduledFor,
    status: "delivered",
  });
}

export function applyTaskReminderAcknowledgement(
  task: TaskRecord,
  request: AcknowledgeTaskReminderRequest,
): TaskRecord | undefined {
  if (
    task.id !== request.id ||
    task.revision !== request.expectedRevision ||
    (task.reminder?.status !== "claimed" &&
      task.reminder?.status !== "delivered")
  ) {
    return;
  }
  return updateReminder(task, request.acknowledgedAt, {
    acknowledgedAt: request.acknowledgedAt,
    claimedAt: task.reminder.claimedAt,
    ...(task.reminder.status === "delivered"
      ? { deliveredAt: task.reminder.deliveredAt }
      : {}),
    scheduledFor: task.reminder.scheduledFor,
    status: "acknowledged",
  });
}

export function clearTerminalTaskReminder(
  task: TaskRecord,
  request: ClearTerminalTaskRemindersRequest,
): TaskRecord | undefined {
  const terminalAt =
    task.reminder?.status === "acknowledged"
      ? task.reminder.acknowledgedAt
      : task.reminder?.status === "cancelled"
        ? task.reminder.cancelledAt
        : undefined;
  if (terminalAt === undefined || terminalAt >= request.cutoff) return;
  const updated: TaskRecord = {
    ...task,
    revision: task.revision + 1,
    updatedAt: request.updatedAt,
  };
  delete updated.reminder;
  assertValidTaskRecord(updated);
  return updated;
}

function updateReminder(
  task: TaskRecord,
  updatedAt: string,
  reminder: TaskReminder,
): TaskRecord {
  const updated: TaskRecord = {
    ...task,
    reminder,
    revision: task.revision + 1,
    updatedAt,
  };
  assertValidTaskRecord(updated);
  return updated;
}

function applyOptionalFieldEdits(
  updated: TaskRecord,
  request: UpdateTaskRequest,
): void {
  if (request.changes.dueDate === null) {
    delete updated.dueDate;
  } else if (request.changes.dueDate !== undefined) {
    updated.dueDate = request.changes.dueDate;
  }
  if (request.changes.note === null) {
    delete updated.note;
  } else if (request.changes.note !== undefined) {
    const note = normalizeTaskNote(request.changes.note);
    if (note === undefined) delete updated.note;
    else updated.note = note;
  }
}

function applyTaskStatusTransition(
  updated: TaskRecord,
  previous: TaskRecord,
  request: UpdateTaskRequest,
): void {
  if (updated.status === "open") {
    delete updated.completedAt;
    return;
  }
  updated.completedAt =
    previous.status === "completed"
      ? (previous.completedAt ?? request.updatedAt)
      : request.updatedAt;
  if (previous.reminder?.status === "scheduled") {
    updated.reminder = cancelReminder(previous.reminder, request.updatedAt);
  }
}

function applyReminderEdit(
  updated: TaskRecord,
  previous: TaskRecord,
  request: UpdateTaskRequest,
): void {
  const reminderAt = request.changes.reminderAt;
  if (reminderAt === undefined) return;
  if (reminderAt === null) {
    if (previous.reminder?.status === "scheduled") {
      updated.reminder = cancelReminder(previous.reminder, request.updatedAt);
    }
    return;
  }
  if (
    previous.reminder !== undefined &&
    previous.reminder.status !== "scheduled" &&
    previous.reminder.status !== "cancelled"
  ) {
    throw new Error("A task reminder cannot change after delivery begins.");
  }
  const reminder = createScheduledReminder(reminderAt, request.updatedAt);
  if (!reminder) throw new Error("Task state is invalid.");
  updated.reminder = reminder;
}

function cancelReminder(
  reminder: Extract<TaskReminder, { status: "scheduled" }>,
  cancelledAt: string,
): TaskReminder {
  return {
    cancelledAt,
    scheduledFor: reminder.scheduledFor,
    status: "cancelled",
  };
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
