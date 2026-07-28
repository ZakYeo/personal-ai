import { createInMemoryTaskStore } from "../../adapters/local/in-memory-task-store.js";
import type { NotificationDeliveryRequest } from "../../ports/notification-delivery.js";
import type { TaskRecord, TaskStore } from "../../ports/task-store.js";
import {
  processTaskReminderCycle,
  runTaskReminderScheduler,
} from "./task-reminder-scheduler.js";

const scheduledFor = "2026-07-29T08:00:00.000Z";

describe("processTaskReminderCycle", () => {
  it("persists a claim before output and marks delivery without completing the task", async () => {
    const fixture = await createFixture();
    let stateDuringDelivery: TaskRecord[] | undefined;

    await processTaskReminderCycle({
      clock: { now: () => new Date(scheduledFor) },
      delivery: {
        deliver: async () => {
          stateDuringDelivery = await fixture.store.listTasks();
        },
      },
      reportFailure: () => {},
      store: fixture.store,
    });

    expect(stateDuringDelivery?.[0]?.reminder).toMatchObject({
      status: "claimed",
    });
    const delivered = await fixture.store.listTasks();
    expect(delivered[0]?.reminder).toMatchObject({
      deliveredAt: scheduledFor,
      status: "delivered",
    });
    expect(delivered[0]?.status).toBe("open");
  });

  it("leaves a failed delivery claimed and reports diagnostics best effort", async () => {
    const fixture = await createFixture();
    const deliveryFailure = new Error("private speaker failure");
    const failures: unknown[] = [];

    await processTaskReminderCycle({
      clock: { now: () => new Date(scheduledFor) },
      delivery: { deliver: () => Promise.reject(deliveryFailure) },
      reportFailure: (failure) => {
        failures.push(failure);
        throw new Error("diagnostic writer failure");
      },
      store: fixture.store,
    });

    expect(failures).toEqual([deliveryFailure]);
    const tasks = await fixture.store.listTasks();
    expect(tasks[0]?.reminder).toMatchObject({ status: "claimed" });
    expect(tasks[0]?.status).toBe("open");
  });

  it("returns the next future reminder without claiming it", async () => {
    const fixture = await createFixture();

    await expect(
      processTaskReminderCycle({
        clock: { now: () => new Date("2026-07-29T07:00:00.000Z") },
        delivery: { deliver: () => Promise.resolve() },
        reportFailure: () => {},
        store: fixture.store,
      }),
    ).resolves.toBe(scheduledFor);
    expect((await fixture.store.listTasks())[0]?.reminder).toMatchObject({
      status: "scheduled",
    });
  });
});

describe("runTaskReminderScheduler", () => {
  it("reports interrupted claims once and never replays uncertain output", async () => {
    const fixture = await createFixture();
    const task = (await fixture.store.listTasks())[0]!;
    await fixture.store.claimReminder({
      claimedAt: scheduledFor,
      expectedRevision: task.revision,
      id: task.id,
    });
    const shutdown = new AbortController();
    const delivered: NotificationDeliveryRequest[] = [];
    const failures: unknown[] = [];

    await runTaskReminderScheduler({
      clock: { now: () => new Date("2026-07-29T08:05:00.000Z") },
      clockRecheckMs: 1_000,
      delivery: {
        deliver: (request) => {
          delivered.push(request);
          return Promise.resolve();
        },
      },
      reportFailure: (failure) => {
        failures.push(failure);
      },
      shutdownSignal: shutdown.signal,
      store: fixture.store,
      timer: {
        wait: () => {
          shutdown.abort();
          return Promise.resolve();
        },
      },
    });

    expect(delivered).toEqual([]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      message: `Task reminder ${task.id} has an interrupted delivery claim.`,
    });
  });

  it("bounds future waits and exits through the shutdown signal", async () => {
    const fixture = await createFixture();
    const shutdown = new AbortController();
    const waits: number[] = [];

    await runTaskReminderScheduler({
      clock: { now: () => new Date("2026-07-29T07:00:00.000Z") },
      clockRecheckMs: 1_000,
      delivery: { deliver: () => Promise.resolve() },
      reportFailure: () => {},
      shutdownSignal: shutdown.signal,
      store: fixture.store,
      timer: {
        wait: (delayMs) => {
          waits.push(delayMs);
          shutdown.abort();
          return Promise.resolve();
        },
      },
    });

    expect(waits).toEqual([1_000]);
  });

  it("does no state or timer work after shutdown was already requested", async () => {
    const fixture = await createFixture();
    const shutdown = new AbortController();
    shutdown.abort();
    const listTasks = vi.spyOn(fixture.store, "listTasks");

    await runTaskReminderScheduler({
      clock: { now: () => new Date(scheduledFor) },
      clockRecheckMs: 1_000,
      delivery: {
        deliver: () => Promise.reject(new Error("must not deliver")),
      },
      reportFailure: () => {},
      shutdownSignal: shutdown.signal,
      store: fixture.store,
      timer: { wait: () => Promise.reject(new Error("must not wait")) },
    });

    expect(listTasks).not.toHaveBeenCalled();
  });
});

async function createFixture(): Promise<{ store: TaskStore }> {
  const store = createInMemoryTaskStore({
    createListId: () => "task-list-1",
    createTaskId: () => "task-1",
    now: () => new Date("2026-07-28T09:00:00.000Z"),
  });
  const list = await store.addList({ name: "To-do" });
  await store.addTask({
    label: "Submit the form",
    listId: list.id,
    reminderAt: scheduledFor,
  });
  return { store };
}
