import type { FeatureResult } from "../../ports/feature.js";
import type { TaskListRecord, TaskRecord } from "../../ports/task-store.js";

const maxDisplayedItems = 10;

export function availableListsResult(
  lists: readonly TaskListRecord[],
): FeatureResult {
  if (lists.length === 0) {
    return {
      resultReferences: emptyTaskReferences(),
      text: "You do not have any personal lists.",
    };
  }
  const shown = lists.slice(0, maxDisplayedItems);
  const data = Object.fromEntries(
    shown.flatMap((list, index) => [
      [`list${index}Id`, list.id],
      [`list${index}Name`, list.name],
    ]),
  );
  return {
    data: {
      ...data,
      listCount: lists.length,
      ...(shown.length < lists.length
        ? { visibleListCount: shown.length }
        : {}),
    },
    resultReferences: emptyTaskReferences(),
    text: `You have ${joinHuman(
      shown.map((list) => list.name),
    )} lists${remainingSuffix(lists.length, shown.length)}.`,
  };
}

export function createdTaskResult(
  list: TaskListRecord,
  task: TaskRecord,
): FeatureResult {
  const scheduledReminder =
    task.reminder?.status === "scheduled" ? task.reminder : undefined;
  return {
    data: {
      ...(task.dueDate ? { dueDate: task.dueDate } : {}),
      id: task.id,
      label: task.label,
      listId: list.id,
      listName: list.name,
      ...(task.note ? { note: task.note } : {}),
      ...(scheduledReminder
        ? {
            reminderAt: scheduledReminder.scheduledFor,
            reminderStatus: scheduledReminder.status,
          }
        : {}),
      revision: task.revision,
      status: task.status,
    },
    resultReferences: createTaskResultReferences(list, [task]),
    text: scheduledReminder
      ? `Added ${task.label} to your ${list.name} list with a reminder for ${scheduledReminder.scheduledFor}.`
      : `Added ${task.label} to your ${list.name} list.`,
  };
}

export function emptyTaskReferences() {
  return { items: [], kind: "task_items" as const };
}

export function taskListResult(
  list: TaskListRecord,
  tasks: readonly TaskRecord[],
): FeatureResult {
  if (tasks.length === 0) {
    return {
      data: { listId: list.id, listName: list.name, taskCount: 0 },
      resultReferences: emptyTaskReferences(),
      text: `Your ${list.name} list is empty.`,
    };
  }
  const shown = tasks.slice(0, maxDisplayedItems);
  const data = Object.fromEntries(
    shown.flatMap((task, index) => [
      [`task${index}Id`, task.id],
      [`task${index}Label`, task.label],
      [`task${index}Status`, task.status],
    ]),
  );
  return {
    data: {
      listId: list.id,
      listName: list.name,
      ...data,
      taskCount: tasks.length,
      ...(shown.length < tasks.length
        ? { visibleTaskCount: shown.length }
        : {}),
    },
    resultReferences: createTaskResultReferences(list, shown),
    text: `Your ${list.name} list has ${joinHuman(
      shown.map((task) => task.label),
    )}${remainingSuffix(tasks.length, shown.length)}.`,
  };
}

export function taskStatusResult(
  list: TaskListRecord,
  task: TaskRecord,
): FeatureResult {
  return {
    data: {
      ...(task.completedAt ? { completedAt: task.completedAt } : {}),
      id: task.id,
      label: task.label,
      listId: list.id,
      listName: list.name,
      ...(task.reminder ? { reminderStatus: task.reminder.status } : {}),
      revision: task.revision,
      status: task.status,
    },
    text:
      task.status === "completed"
        ? `Completed ${task.label} on your ${list.name} list.`
        : `Reopened ${task.label} on your ${list.name} list.`,
  };
}

function createTaskResultReferences(
  list: TaskListRecord,
  tasks: readonly TaskRecord[],
) {
  return {
    items: tasks.map((task) => ({
      facts: {
        ...(task.dueDate ? { dueDate: task.dueDate } : {}),
        label: task.label,
        listName: list.name,
        ...(task.reminder?.status === "scheduled"
          ? { reminderAt: task.reminder.scheduledFor }
          : {}),
        status: task.status,
      },
      target: {
        kind: "task_item" as const,
        listId: list.id,
        listRevision: list.revision,
        revision: task.revision,
        taskId: task.id,
      },
    })),
    kind: "task_items" as const,
  };
}

function joinHuman(values: readonly string[]): string {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function remainingSuffix(total: number, visible: number): string {
  const remaining = total - visible;
  return remaining > 0 ? `, plus ${remaining} more` : "";
}
