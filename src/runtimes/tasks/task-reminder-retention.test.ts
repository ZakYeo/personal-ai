import { createInMemoryTaskStore } from "../../adapters/local/in-memory-task-store.js";
import {
  clearExpiredTaskReminderHistory,
  runTaskReminderRetention,
} from "./task-reminder-retention.js";

const retentionMs = 30 * 24 * 60 * 60_000;

describe("task reminder retention", () => {
  it("clears terminal reminder history without deleting its task", async () => {
    const store = createInMemoryTaskStore({
      createListId: () => "task-list-1",
      createTaskId: () => "task-1",
      now: () => new Date("2026-07-01T09:00:00.000Z"),
    });
    const list = await store.addList({ name: "To-do" });
    const task = await store.addTask({
      label: "Submit form",
      listId: list.id,
      reminderAt: "2026-07-02T09:00:00.000Z",
    });
    await store.updateTask({
      changes: { reminderAt: null },
      expectedRevision: task.revision,
      id: task.id,
      updatedAt: "2026-07-02T08:00:00.000Z",
    });

    await expect(
      clearExpiredTaskReminderHistory({
        clock: { now: () => new Date("2026-08-02T09:00:00.000Z") },
        retentionMs,
        store,
      }),
    ).resolves.toBe(1);
    await expect(store.listTasks()).resolves.toEqual([
      expect.objectContaining({
        id: task.id,
        label: task.label,
        status: "open",
      }),
    ]);
    expect((await store.listTasks())[0]).not.toHaveProperty("reminder");
  });

  it("runs immediately and stops its daily wait on shutdown", async () => {
    const store = createInMemoryTaskStore({
      now: () => new Date("2026-07-01T09:00:00.000Z"),
    });
    const shutdown = new AbortController();
    const waits: number[] = [];

    await runTaskReminderRetention({
      clock: { now: () => new Date("2026-08-02T09:00:00.000Z") },
      intervalMs: 86_400_000,
      retentionMs,
      shutdownSignal: shutdown.signal,
      store,
      timer: {
        wait: (delayMs) => {
          waits.push(delayMs);
          shutdown.abort();
          return Promise.resolve();
        },
      },
    });

    expect(waits).toEqual([86_400_000]);
  });
});
