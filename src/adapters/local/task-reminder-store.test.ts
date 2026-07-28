import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TaskStore } from "../../ports/task-store.js";
import { createFileTaskStore } from "./file-task-store.js";
import { createInMemoryTaskStore } from "./in-memory-task-store.js";

const createdAt = new Date("2026-07-28T09:00:00.000Z");
const scheduledFor = "2026-07-29T08:00:00.000Z";

describe.each([
  {
    createStore: () =>
      createInMemoryTaskStore({
        createListId: () => "task-list-1",
        createTaskId: () => "task-1",
        now: () => createdAt,
      }),
    label: "in-memory",
  },
  {
    createStore: async () => {
      const directory = await mkdtemp(join(tmpdir(), "personal-ai-tasks-"));
      return createFileTaskStore({
        createListId: () => "task-list-1",
        createTaskId: () => "task-1",
        filePath: join(directory, "tasks.json"),
        now: () => createdAt,
      });
    },
    label: "file",
  },
])("$label task reminder lifecycle", ({ createStore }) => {
  it("claims before delivery, then delivers and acknowledges without completing the task", async () => {
    const store = await createStore();
    const task = await createReminder(store);

    const claimed = await store.claimReminder({
      claimedAt: scheduledFor,
      expectedRevision: task.revision,
      id: task.id,
    });
    expect(claimed).toMatchObject({
      reminder: {
        claimedAt: scheduledFor,
        scheduledFor,
        status: "claimed",
      },
      revision: 2,
      status: "open",
    });
    await expect(
      store.claimReminder({
        claimedAt: scheduledFor,
        expectedRevision: task.revision,
        id: task.id,
      }),
    ).resolves.toBeUndefined();

    const delivered = await store.markReminderDelivered({
      deliveredAt: "2026-07-29T08:00:01.000Z",
      expectedRevision: claimed!.revision,
      id: task.id,
    });
    const acknowledged = await store.acknowledgeReminder({
      acknowledgedAt: "2026-07-29T08:00:02.000Z",
      expectedRevision: delivered!.revision,
      id: task.id,
    });

    expect(acknowledged).toMatchObject({
      reminder: {
        acknowledgedAt: "2026-07-29T08:00:02.000Z",
        claimedAt: scheduledFor,
        deliveredAt: "2026-07-29T08:00:01.000Z",
        scheduledFor,
        status: "acknowledged",
      },
      status: "open",
    });
    expect(acknowledged).not.toHaveProperty("completedAt");
  });

  it("rejects claiming a reminder before its exact instant", async () => {
    const store = await createStore();
    const task = await createReminder(store);

    await expect(
      store.claimReminder({
        claimedAt: "2026-07-29T07:59:59.999Z",
        expectedRevision: task.revision,
        id: task.id,
      }),
    ).rejects.toThrow("A task reminder cannot be claimed before it is due.");
  });

  it("allows a user to acknowledge an interrupted claim without inventing delivery", async () => {
    const store = await createStore();
    const task = await createReminder(store);
    const claimed = await store.claimReminder({
      claimedAt: scheduledFor,
      expectedRevision: task.revision,
      id: task.id,
    });

    const acknowledged = await store.acknowledgeReminder({
      acknowledgedAt: "2026-07-29T08:01:00.000Z",
      expectedRevision: claimed!.revision,
      id: task.id,
    });

    expect(acknowledged?.reminder).toEqual({
      acknowledgedAt: "2026-07-29T08:01:00.000Z",
      claimedAt: scheduledFor,
      scheduledFor,
      status: "acknowledged",
    });
  });
});

describe("task reminder restart and cleanup", () => {
  it("preserves an interrupted durable claim without inventing delivery", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-tasks-"));
    const filePath = join(directory, "tasks.json");
    const first = createFileTaskStore({
      createListId: () => "task-list-1",
      createTaskId: () => "task-1",
      filePath,
      now: () => createdAt,
    });
    const task = await createReminder(first);
    await first.claimReminder({
      claimedAt: scheduledFor,
      expectedRevision: task.revision,
      id: task.id,
    });

    const restarted = createFileTaskStore({
      filePath,
      now: () => createdAt,
    });

    await expect(restarted.listTasks()).resolves.toMatchObject([
      {
        reminder: {
          claimedAt: scheduledFor,
          status: "claimed",
        },
        status: "open",
      },
    ]);
  });

  it("cleans only terminal reminders strictly before the cutoff", async () => {
    let nextTaskId = 0;
    const store = createInMemoryTaskStore({
      createListId: () => "task-list-1",
      createTaskId: () => `task-${++nextTaskId}`,
      now: () => createdAt,
    });
    const list = await store.addList({ name: "To-do" });
    const acknowledged = await store.addTask({
      label: "Acknowledged",
      listId: list.id,
      reminderAt: scheduledFor,
    });
    const claim = await store.claimReminder({
      claimedAt: scheduledFor,
      expectedRevision: acknowledged.revision,
      id: acknowledged.id,
    });
    await store.acknowledgeReminder({
      acknowledgedAt: "2026-07-29T08:01:00.000Z",
      expectedRevision: claim!.revision,
      id: acknowledged.id,
    });
    const cancelled = await store.addTask({
      label: "Cancelled",
      listId: list.id,
      reminderAt: "2026-07-30T08:00:00.000Z",
    });
    await store.updateTask({
      changes: { reminderAt: null },
      expectedRevision: cancelled.revision,
      id: cancelled.id,
      updatedAt: "2026-07-29T08:02:00.000Z",
    });
    const atCutoff = await store.addTask({
      label: "At cutoff",
      listId: list.id,
      reminderAt: "2026-07-30T08:00:00.000Z",
    });
    await store.updateTask({
      changes: { reminderAt: null },
      expectedRevision: atCutoff.revision,
      id: atCutoff.id,
      updatedAt: "2026-07-29T08:03:00.000Z",
    });

    await expect(
      store.clearTerminalRemindersBefore({
        cutoff: "2026-07-29T08:03:00.000Z",
        updatedAt: "2026-08-30T09:00:00.000Z",
      }),
    ).resolves.toBe(2);

    const tasks = await store.listTasks();
    expect(tasks.find(({ label }) => label === "Acknowledged")?.reminder).toBe(
      undefined,
    );
    expect(tasks.find(({ label }) => label === "Cancelled")?.reminder).toBe(
      undefined,
    );
    expect(tasks.find(({ label }) => label === "At cutoff")?.reminder).toEqual(
      expect.objectContaining({ status: "cancelled" }),
    );
  });
});

async function createReminder(store: TaskStore) {
  const list = await store.addList({ name: "To-do" });
  return store.addTask({
    label: "Submit the form",
    listId: list.id,
    reminderAt: scheduledFor,
  });
}
