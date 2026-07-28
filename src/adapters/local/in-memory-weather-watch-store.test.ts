import {
  createActiveWeatherWatch,
  createNewWeatherWatch,
  weatherWatchNow,
} from "../../test-support/weather-watch-store.js";
import { createInMemoryWeatherWatchStore } from "./in-memory-weather-watch-store.js";

describe("createInMemoryWeatherWatchStore", () => {
  it("creates canonical active watches with injected identity and time", async () => {
    const store = createInMemoryWeatherWatchStore({
      createId: () => "weather-watch-1",
      now: () => weatherWatchNow,
    });

    await expect(store.add(createNewWeatherWatch())).resolves.toEqual(
      createActiveWeatherWatch(),
    );
    await expect(store.list()).resolves.toEqual([createActiveWeatherWatch()]);
  });

  it("clones every nested watch field at input and output boundaries", async () => {
    const input = createNewWeatherWatch();
    const store = createInMemoryWeatherWatchStore({
      createId: () => "weather-watch-1",
      now: () => weatherWatchNow,
    });
    const added = await store.add(input);
    input.location.name = "mutated input";
    input.condition.threshold = 99;
    added.location.name = "mutated output";
    added.condition.threshold = 100;

    const listed = await store.list();

    expect(listed[0]).toMatchObject({
      condition: { threshold: 0.1 },
      location: { name: "London" },
    });
  });

  it.each([
    [
      "unsupported condition units",
      createNewWeatherWatch({
        condition: {
          metric: "precipitation",
          operator: "atLeast",
          threshold: 0.1,
          unit: "in",
        } as never,
      }),
    ],
    [
      "unbounded period",
      createNewWeatherWatch({
        period: {
          endAt: "2026-08-20T12:00:00.000Z",
          startAt: "2026-07-28T12:00:00.000Z",
        },
      }),
    ],
    [
      "invalid timezone",
      createNewWeatherWatch({
        location: {
          ...createNewWeatherWatch().location,
          timezone: "Not/AZone",
        },
      }),
    ],
  ])("rejects %s", async (_label, watch) => {
    const store = createInMemoryWeatherWatchStore({
      createId: () => "weather-watch-1",
      now: () => weatherWatchNow,
    });

    await expect(store.add(watch)).rejects.toThrow(
      "Weather watch state is invalid.",
    );
  });

  it("rejects invalid and duplicate generated IDs", async () => {
    const ids = ["weather-watch-1", "weather-watch-1"];
    const store = createInMemoryWeatherWatchStore({
      createId: () => ids.shift() ?? "",
      now: () => weatherWatchNow,
    });
    await store.add(createNewWeatherWatch());

    await expect(store.add(createNewWeatherWatch())).rejects.toThrow(
      "Weather watch store generated an invalid or duplicate ID.",
    );
  });

  it("rejects a twenty-fifth active watch without changing the existing set", async () => {
    let id = 0;
    const store = createInMemoryWeatherWatchStore({
      createId: () => `weather-watch-${++id}`,
      now: () => weatherWatchNow,
    });
    await Promise.all(
      Array.from({ length: 24 }, () => store.add(createNewWeatherWatch())),
    );

    await expect(store.add(createNewWeatherWatch())).rejects.toThrow(
      "cannot contain more than 24 active watches",
    );
    await expect(store.list()).resolves.toHaveLength(24);
  });

  it("cancels only the expected active revision and records the exact terminal time", async () => {
    const store = createInMemoryWeatherWatchStore({
      createId: () => "weather-watch-1",
      now: () => weatherWatchNow,
    });
    const watch = await store.add(createNewWeatherWatch());
    const cancelledAt = "2026-07-28T12:01:00.000Z";

    await expect(
      store.cancel({
        cancelledAt,
        expectedRevision: watch.revision,
        id: watch.id,
      }),
    ).resolves.toEqual({
      ...watch,
      revision: 2,
      status: "cancelled",
      terminalAt: cancelledAt,
      updatedAt: cancelledAt,
    });
    await expect(
      store.cancel({
        cancelledAt: "2026-07-28T12:02:00.000Z",
        expectedRevision: 1,
        id: watch.id,
      }),
    ).resolves.toBeUndefined();
  });

  it("durably claims one notification and closes the watch before delivery", async () => {
    const store = createInMemoryWeatherWatchStore({
      createId: () => "weather-watch-1",
      now: () => weatherWatchNow,
    });
    const watch = await store.add(createNewWeatherWatch());
    const claimedAt = "2026-07-28T12:02:00.000Z";
    const window = {
      endAt: "2026-07-29T10:00:00.000Z",
      startAt: "2026-07-29T09:00:00.000Z",
    };

    const claimed = await store.claimNotification({
      claimedAt,
      expectedRevision: watch.revision,
      id: watch.id,
      window,
    });

    expect(claimed).toEqual({
      ...watch,
      notification: { claimedAt, window },
      revision: 2,
      status: "triggered",
      terminalAt: claimedAt,
      updatedAt: claimedAt,
    });
    window.startAt = "2026-01-01T00:00:00.000Z";
    claimed!.notification!.window.startAt = "2026-02-01T00:00:00.000Z";
    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({
        notification: {
          claimedAt,
          window: {
            endAt: "2026-07-29T10:00:00.000Z",
            startAt: "2026-07-29T09:00:00.000Z",
          },
        },
      }),
    ]);
    await expect(
      store.claimNotification({
        claimedAt: "2026-07-28T12:03:00.000Z",
        expectedRevision: 2,
        id: watch.id,
        window: {
          endAt: "2026-07-29T10:00:00.000Z",
          startAt: "2026-07-29T09:00:00.000Z",
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("expires an elapsed active watch through the same terminal policy", async () => {
    const store = createInMemoryWeatherWatchStore({
      createId: () => "weather-watch-1",
      now: () => weatherWatchNow,
    });
    const watch = await store.add(createNewWeatherWatch());
    const expiredAt = "2026-07-29T12:00:01.000Z";

    await expect(
      store.expire({
        expectedRevision: watch.revision,
        expiredAt,
        id: watch.id,
      }),
    ).resolves.toMatchObject({
      revision: 2,
      status: "expired",
      terminalAt: expiredAt,
      updatedAt: expiredAt,
    });
  });
});
