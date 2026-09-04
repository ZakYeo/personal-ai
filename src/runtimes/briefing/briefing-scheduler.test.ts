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
    const dependencies = {
      aggregator: createDailyBriefingAggregator([
        {
          read: () =>
            Promise.resolve({
              attention: [],
              facts: { taskCount: 1 },
              items: [{ key: "task:one", text: "One task is due." }],
              section: "tasks" as const,
            }),
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

    expect(delivered).toEqual(["briefing:Europe/London:2026-09-07:08:00:2"]);
    await expect(store.getLastSnapshot()).resolves.toMatchObject({
      sections: [{ section: "tasks" }],
    });
  });
});
