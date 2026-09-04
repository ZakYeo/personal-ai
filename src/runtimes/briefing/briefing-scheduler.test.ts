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
          weekdays: ["monday", "tuesday"],
        },
      },
      updatedAt: now.toISOString(),
    });
    const delivered: string[] = [];
    const spokenTimeZones: string[] = [];
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
        deliver: (notification: {
          id: string;
          spokenText?: { timeZone: string };
        }) => {
          delivered.push(notification.id);
          if (notification.spokenText) {
            spokenTimeZones.push(notification.spokenText.timeZone);
          }
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
      preferences: {
        ...current,
        length: "short",
        schedule: {
          ...current.schedule!,
          weekdays: ["tuesday", "monday"],
        },
      },
      updatedAt: now.toISOString(),
    });
    await processBriefingScheduleCycle(dependencies);

    expect(delivered).toEqual([
      "briefing:Europe/London:2026-09-07:08:00:monday,tuesday",
    ]);
    expect(readSource).toHaveBeenCalledTimes(1);
    expect(spokenTimeZones).toEqual(["Europe/London"]);
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
      "briefing:Europe/London:2026-09-07:08:00:monday,tuesday",
      "briefing:Europe/London:2026-09-07:08:01:monday,tuesday",
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
        searchTopics: ["topic"],
        sections: ["internet"],
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
        items: [
          { key: "internet:topic", text: `topic: ${"word ".repeat(800)}` },
        ],
        section: "internet" as const,
      }),
    );
    const aggregator = createDailyBriefingAggregator([
      { read, section: "internet" },
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
    const snapshot = await createStore().getLastSnapshot();
    expect(snapshot!.sections[0]!.items[0]!.text.length).toBeLessThanOrEqual(
      500,
    );
  });

  it("defers overnight quiet-hour delivery within the same local day", async () => {
    let now = new Date("2026-09-07T05:45:00.000Z");
    const store = await scheduledStore(() => now, "06:30", "Europe/London", [
      "monday",
    ]);
    const deliver = vi.fn(() => Promise.resolve());
    const dependencies = {
      aggregator: createDailyBriefingAggregator([]),
      clock: { now: () => now },
      delivery: { deliver },
      reportFailure: () => {},
      store,
    };

    await processBriefingScheduleCycle(dependencies);
    now = new Date("2026-09-07T06:00:00.000Z");
    await processBriefingScheduleCycle(dependencies);

    expect(deliver).toHaveBeenCalledOnce();
  });

  it("skips quiet-hour schedules that cannot be deferred within the local day", async () => {
    const now = new Date("2026-09-07T22:01:00.000Z");
    const store = await scheduledStore(() => now, "23:00", "Europe/London", [
      "monday",
    ]);
    const read = vi.fn();
    const deliver = vi.fn();

    await processBriefingScheduleCycle({
      aggregator: { create: read },
      clock: { now: () => now },
      delivery: { deliver },
      reportFailure: () => {},
      store,
    });

    expect(read).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it("uses the configured local weekday and time across a DST transition", async () => {
    const now = new Date("2026-10-25T08:01:00.000Z");
    const store = await scheduledStore(() => now, "08:00", "Europe/London", [
      "sunday",
    ]);
    const deliver = vi.fn(() => Promise.resolve());

    await processBriefingScheduleCycle({
      aggregator: createDailyBriefingAggregator([]),
      clock: { now: () => now },
      delivery: { deliver },
      reportFailure: () => {},
      store,
    });

    expect(deliver).toHaveBeenCalledOnce();
  });

  it("does no work when shutdown arrives before the durable claim", async () => {
    const now = new Date("2026-09-07T07:01:00.000Z");
    const controller = new AbortController();
    const store = await scheduledStore(() => now, "08:00", "Europe/London", [
      "monday",
    ]);
    const claim = vi.spyOn(store, "claimDeliverySlot");
    const getPreferences = store.getPreferences;
    const abortingStore = {
      ...store,
      getPreferences: async () => {
        const preferences = await getPreferences();
        controller.abort();
        return preferences;
      },
    };

    await processBriefingScheduleCycle({
      aggregator: createDailyBriefingAggregator([]),
      clock: { now: () => now },
      delivery: { deliver: vi.fn() },
      reportFailure: () => {},
      shutdownSignal: controller.signal,
      store: abortingStore,
    });

    expect(claim).not.toHaveBeenCalled();
  });

  it("keeps post-claim delivery failures unknown without retrying or trusting diagnostics", async () => {
    const now = new Date("2026-09-07T07:01:00.000Z");
    const store = await scheduledStore(() => now, "08:00", "Europe/London", [
      "monday",
    ]);
    const read = vi.fn(() =>
      Promise.resolve({
        attention: [],
        facts: {},
        items: [{ key: "task:one", text: "One task." }],
        section: "tasks" as const,
      }),
    );
    const deliver = vi.fn(() => Promise.reject(new Error("speaker offline")));
    const reportFailure = vi.fn(() => {
      throw new Error("diagnostic sink offline");
    });
    const dependencies = {
      aggregator: createDailyBriefingAggregator([
        { read, section: "tasks" as const },
      ]),
      clock: { now: () => now },
      delivery: { deliver },
      reportFailure,
      store,
    };

    await expect(
      processBriefingScheduleCycle(dependencies),
    ).resolves.toBeUndefined();
    await processBriefingScheduleCycle(dependencies);

    expect(read).toHaveBeenCalledOnce();
    expect(deliver).toHaveBeenCalledOnce();
    expect(reportFailure).toHaveBeenCalledOnce();
    await expect(store.getLastSnapshot()).resolves.toBeUndefined();
  });

  it("delivers a safe partial briefing when one source API fails", async () => {
    const now = new Date("2026-09-07T07:01:00.000Z");
    const store = await scheduledStore(() => now, "08:00", "Europe/London", [
      "monday",
    ]);
    const deliver = vi.fn(() => Promise.resolve());
    const reportFailure = vi.fn();

    await processBriefingScheduleCycle({
      aggregator: createDailyBriefingAggregator([
        {
          read: () => Promise.reject(new Error("private API failure")),
          section: "tasks",
        },
      ]),
      clock: { now: () => now },
      delivery: { deliver },
      reportFailure,
      store,
    });

    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Tasks is unavailable." }),
      {},
    );
    expect(reportFailure).toHaveBeenCalledOnce();
  });
});

async function scheduledStore(
  now: () => Date,
  localTime: string,
  timeZone: string,
  weekdays: readonly (
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday"
  )[],
) {
  const store = createInMemoryBriefingStore({
    now,
    sections: ["tasks"],
    timeZone,
  });
  const preferences = await store.getPreferences();
  await store.updatePreferences({
    expectedRevision: preferences.revision,
    preferences: {
      ...preferences,
      schedule: { localTime, timeZone, weekdays },
    },
    updatedAt: now().toISOString(),
  });
  return store;
}
