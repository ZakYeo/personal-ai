import { describe, expect, it } from "vitest";

import type {
  TaskListRecord,
  TaskRecord,
  TaskReminder,
} from "../ports/task-store.js";
import {
  assertValidTaskListRecord,
  assertValidTaskRecord,
  cloneTaskRecord,
} from "./task-policy.js";

const createdAt = "2026-07-28T09:00:00.000Z";

function listRecord(overrides: Partial<TaskListRecord> = {}): TaskListRecord {
  return {
    createdAt,
    id: "task-list-1",
    name: "Shopping",
    revision: 1,
    updatedAt: createdAt,
    ...overrides,
  };
}

function taskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    createdAt,
    id: "task-1",
    label: "Submit the form",
    listId: "task-list-1",
    revision: 1,
    status: "open",
    updatedAt: createdAt,
    ...overrides,
  };
}

describe("task policy", () => {
  it("accepts canonical list and task records", () => {
    expect(() => assertValidTaskListRecord(listRecord())).not.toThrow();
    expect(() =>
      assertValidTaskRecord(
        taskRecord({
          dueDate: "2026-07-29",
          note: "Use the signed copy",
          reminder: {
            scheduledFor: "2026-07-29T08:00:00.000Z",
            status: "scheduled",
          },
        }),
      ),
    ).not.toThrow();
  });

  it.each([
    ["empty ID", listRecord({ id: "" })],
    ["untrimmed name", listRecord({ name: " Shopping" })],
    ["empty name", listRecord({ name: "" })],
    ["malformed timestamp", listRecord({ updatedAt: "2026-07-28" })],
    [
      "update before creation",
      listRecord({ updatedAt: "2026-07-27T09:00:00.000Z" }),
    ],
    ["invalid revision", listRecord({ revision: 0 })],
  ])("rejects a list with %s", (_label, record) => {
    expect(() => assertValidTaskListRecord(record)).toThrow(
      "Task list state is invalid.",
    );
  });

  it.each([
    ["empty ID", taskRecord({ id: "" })],
    ["empty list ID", taskRecord({ listId: "" })],
    ["untrimmed label", taskRecord({ label: " Submit the form" })],
    ["empty label", taskRecord({ label: "" })],
    ["empty note", taskRecord({ note: "" })],
    ["untrimmed note", taskRecord({ note: "Check it " })],
    ["invalid due date", taskRecord({ dueDate: "2026-02-30" })],
    [
      "completion without its transition timestamp",
      taskRecord({ status: "completed" }),
    ],
    [
      "completion timestamp on an open task",
      taskRecord({ completedAt: createdAt }),
    ],
    [
      "a scheduled reminder on a completed task",
      taskRecord({
        completedAt: createdAt,
        reminder: {
          scheduledFor: "2026-07-29T08:00:00.000Z",
          status: "scheduled",
        },
        status: "completed",
      }),
    ],
  ])("rejects a task with %s", (_label, record) => {
    expect(() => assertValidTaskRecord(record)).toThrow(
      "Task state is invalid.",
    );
  });

  it.each([
    {
      claimedAt: "2026-07-29T08:00:01.000Z",
      scheduledFor: "2026-07-29T08:00:00.000Z",
      status: "claimed" as const,
    },
    {
      claimedAt: "2026-07-29T08:00:01.000Z",
      deliveredAt: "2026-07-29T08:00:02.000Z",
      scheduledFor: "2026-07-29T08:00:00.000Z",
      status: "delivered" as const,
    },
    {
      acknowledgedAt: "2026-07-29T08:00:03.000Z",
      claimedAt: "2026-07-29T08:00:01.000Z",
      deliveredAt: "2026-07-29T08:00:02.000Z",
      scheduledFor: "2026-07-29T08:00:00.000Z",
      status: "acknowledged" as const,
    },
    {
      cancelledAt: "2026-07-28T10:00:00.000Z",
      scheduledFor: "2026-07-29T08:00:00.000Z",
      status: "cancelled" as const,
    },
  ])("accepts a canonical $status reminder lifecycle", (reminder) => {
    const updatedAt =
      reminder.acknowledgedAt ??
      reminder.deliveredAt ??
      reminder.claimedAt ??
      reminder.cancelledAt ??
      createdAt;
    expect(() =>
      assertValidTaskRecord(taskRecord({ reminder, updatedAt })),
    ).not.toThrow();
  });

  it.each([
    {
      claimedAt: createdAt,
      scheduledFor: "2026-07-29T08:00:00.000Z",
      status: "scheduled" as const,
    },
    {
      scheduledFor: "2026-07-29T08:00:00.000Z",
      status: "claimed" as const,
    },
    {
      deliveredAt: "2026-07-29T08:00:02.000Z",
      scheduledFor: "2026-07-29T08:00:00.000Z",
      status: "delivered" as const,
    },
    {
      acknowledgedAt: "2026-07-29T08:00:03.000Z",
      claimedAt: "2026-07-29T08:00:01.000Z",
      deliveredAt: "2026-07-29T08:00:02.000Z",
      scheduledFor: "2026-07-29T08:00:00.000Z",
      status: "delivered" as const,
    },
  ])("rejects an inconsistent $status reminder lifecycle", (reminder) => {
    expect(() =>
      assertValidTaskRecord(
        taskRecord({ reminder: reminder as unknown as TaskReminder }),
      ),
    ).toThrow("Task state is invalid.");
  });

  it("clones nested reminder state at the boundary", () => {
    const original = taskRecord({
      reminder: {
        scheduledFor: "2026-07-29T08:00:00.000Z",
        status: "scheduled",
      },
    });

    const cloned = cloneTaskRecord(original);
    if (!cloned.reminder) throw new Error("Expected reminder.");
    cloned.reminder.scheduledFor = "2026-07-30T08:00:00.000Z";

    expect(original.reminder).toEqual({
      scheduledFor: "2026-07-29T08:00:00.000Z",
      status: "scheduled",
    });
  });

  it("preserves earlier lifecycle facts across later task edits", () => {
    expect(() =>
      assertValidTaskRecord(
        taskRecord({
          completedAt: "2026-07-28T10:00:00.000Z",
          reminder: {
            claimedAt: "2026-07-28T09:30:00.000Z",
            deliveredAt: "2026-07-28T09:31:00.000Z",
            scheduledFor: "2026-07-28T09:15:00.000Z",
            status: "delivered",
          },
          status: "completed",
          updatedAt: "2026-07-28T11:00:00.000Z",
        }),
      ),
    ).not.toThrow();
  });
});
