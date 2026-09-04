import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileBriefingStore } from "../../adapters/local/file-briefing-store.js";
import { createDailyBriefingAggregator } from "../../application/briefing-policy.js";
import { createInMemoryBriefingStore } from "../../test-support/briefing-store.js";
import {
  processBriefingScheduleCycle,
  runBriefingScheduler,
} from "./briefing-scheduler.js";

describe("processBriefingScheduleCycle", () => {
  it("stops without reading state when shutdown is already requested", async () => {
    const controller = new AbortController();
    controller.abort();
    const getPreferences = vi.fn();

    await runBriefingScheduler({
      aggregator: createDailyBriefingAggregator([]),
      clock: { now: () => new Date("2026-09-07T07:01:00.000Z") },
      delivery: { deliver: () => Promise.resolve() },
      intervalMs: 60_000,
      reportFailure: () => {},
      shutdownSignal: controller.signal,
      store: {
        claimDeliverySlot: () => Promise.resolve(false),
        completeDeliverySlot: () => Promise.resolve(false),
        getLastSnapshot: () => Promise.resolve(undefined),
        getPreferences,
        saveSnapshot: () => Promise.resolve(),
        skipDeliverySlot: () => Promise.resolve(false),
        updatePreferences: () => Promise.resolve(undefined),
      },
    });

    expect(getPreferences).not.toHaveBeenCalled();
  });

  it("claims before output and delivers one local slot at most once", async () => {
    const now = new Date("2026-09-07T07:01:00.000Z");
    const store = createInMemoryBriefingStore({
      now: () => now,
      sections: ["tasks"],
      timeZone: "Europe/London",
    });
    const preferences = await store.getPreferences();
    await store.updatePreferences({
      expectedRevision: preferences.revision,
      preferences: {
        ...preferences,
        schedule: {
          localTime: "08:00",
          timeZone: "Europe/London",
          weekdays: ["monday"],
        },
      },
      updatedAt: now.toISOString(),
    });
    const delivered: string[] = [];
    const readSource = vi.fn(() =>
      Promise.resolve({
        attention: [],
        facts: { taskCount: 1 },
        items: [{ key: "task:one", text: "One task is due." }],
        section: "tasks" as const,
      }),
    );
    const dependencies = {
      aggregator: createDailyBriefingAggregator([
        {
          read: readSource,
          section: "tasks" as const,
        },
      ]),
      clock: { now: () => now },
      delivery: {
        deliver: (notification: { id: string }) => {
          delivered.push(notification.id);
          return Promise.resolve();
        },
      },
      reportFailure: () => {},
      store,
    };

    await processBriefingScheduleCycle(dependencies);
    await processBriefingScheduleCycle(dependencies);
    const current = await store.getPreferences();
    await store.updatePreferences({
      expectedRevision: current.revision,
      preferences: { ...current, length: "short" },
      updatedAt: now.toISOString(),
    });
    await processBriefingScheduleCycle(dependencies);

    expect(delivered).toEqual([
      "briefing:Europe/London:2026-09-07:08:00:monday",
    ]);
    expect(readSource).toHaveBeenCalledTimes(1);
    await expect(store.getLastSnapshot()).resolves.toMatchObject({
      sections: [{ section: "tasks" }],
    });

    const revised = await store.getPreferences();
    await store.updatePreferences({
      expectedRevision: revised.revision,
      preferences: {
        ...revised,
        schedule: { ...revised.schedule!, localTime: "08:01" },
      },
      updatedAt: now.toISOString(),
    });
    await processBriefingScheduleCycle(dependencies);

    expect(delivered).toEqual([
      "briefing:Europe/London:2026-09-07:08:00:monday",
      "briefing:Europe/London:2026-09-07:08:01:monday",
    ]);
    expect(readSource).toHaveBeenCalledTimes(2);
  });

  it("does not repeat source reads after a process restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "briefing-scheduler-"));
    const filePath = join(directory, "briefings.json");
    const now = new Date("2026-09-07T07:01:00.000Z");
    const createStore = () =>
      createFileBriefingStore({
        filePath,
        now: () => now,
        timeZone: "Europe/London",
      });
    const firstStore = createStore();
    const preferences = await firstStore.getPreferences();
    await firstStore.updatePreferences({
      expectedRevision: preferences.revision,
      preferences: {
        ...preferences,
        schedule: {
          localTime: "08:00",
          timeZone: "Europe/London",
          weekdays: ["monday"],
        },
      },
      updatedAt: now.toISOString(),
    });
    const read = vi.fn(() =>
      Promise.resolve({
        attention: [],
        facts: {},
        items: [{ key: "task:one", text: "One task is due." }],
        section: "tasks" as const,
      }),
    );
    const aggregator = createDailyBriefingAggregator([
      { read, section: "tasks" },
    ]);
    const delivery = { deliver: vi.fn(() => Promise.resolve()) };

    await processBriefingScheduleCycle({
      aggregator,
      clock: { now: () => now },
      delivery,
      reportFailure: () => {},
      store: firstStore,
    });
    await processBriefingScheduleCycle({
      aggregator,
      clock: { now: () => now },
      delivery,
      reportFailure: () => {},
      store: createStore(),
    });

    expect(read).toHaveBeenCalledTimes(1);
    expect(delivery.deliver).toHaveBeenCalledTimes(1);
  });
});
