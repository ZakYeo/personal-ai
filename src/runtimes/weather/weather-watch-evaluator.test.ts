import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFileWeatherWatchStore } from "../../adapters/local/file-weather-watch-store.js";
import { createInMemoryWeatherWatchStore } from "../../adapters/local/in-memory-weather-watch-store.js";
import type { NotificationDeliveryRequest } from "../../ports/notification-delivery.js";
import type { WeatherWatchStore } from "../../ports/weather-watch-store.js";
import { createWeatherProviderFixture } from "../../test-support/weather.js";
import {
  createNewWeatherWatch,
  weatherWatchNow,
} from "../../test-support/weather-watch-store.js";
import {
  processWeatherWatchEvaluationCycle,
  runWeatherWatchEvaluator,
} from "./weather-watch-evaluator.js";
import { systemRuntimeBackgroundTaskTimer } from "../background-task.js";

const evaluationNow = new Date("2026-07-28T12:05:00.000Z");

describe("processWeatherWatchEvaluationCycle", () => {
  it("durably claims the first qualifying hourly window before exact delivery", async () => {
    const events: string[] = [];
    const backingStore = createStore();
    const watch = await backingStore.add(createNewWeatherWatch());
    const store: WeatherWatchStore = {
      ...backingStore,
      claimNotification: async (request) => {
        const claimed = await backingStore.claimNotification(request);
        events.push("claimed");
        return claimed;
      },
    };
    const delivered: NotificationDeliveryRequest[] = [];

    await processWeatherWatchEvaluationCycle({
      clock: { now: () => evaluationNow },
      delivery: {
        deliver: (notification) => {
          events.push("delivered");
          delivered.push(notification);
          return Promise.resolve();
        },
      },
      maxForecastAgeMs: 360 * 60_000,
      provider: createWeatherProviderFixture(),
      reportFailure: () => {},
      store,
    });

    expect(events).toEqual(["claimed", "delivered"]);
    expect(delivered).toEqual([
      {
        id: watch.id,
        text: "Weather watch weather-watch-1 matched in London: precipitation is forecast at 0.4 mm from 2026-07-29T09:00:00.000Z to 2026-07-29T10:00:00.000Z. Source: Deterministic weather fixture (https://example.test/weather-source). Weather watches are convenience notifications, not guaranteed emergency alerts.",
      },
    ]);
    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({
        notification: {
          claimedAt: evaluationNow.toISOString(),
          window: {
            endAt: "2026-07-29T10:00:00.000Z",
            startAt: "2026-07-29T09:00:00.000Z",
          },
        },
        revision: 2,
        status: "triggered",
      }),
    ]);
  });

  it("evaluates temperature and wind operators against exact hourly facts", async () => {
    const ids = [
      "weather-watch-cold",
      "weather-watch-hot",
      "weather-watch-wind",
    ];
    const store = createInMemoryWeatherWatchStore({
      createId: () => ids.shift() ?? "unexpected",
      now: () => weatherWatchNow,
    });
    await store.add(
      createNewWeatherWatch({
        condition: {
          metric: "temperature",
          operator: "atMost",
          threshold: 17,
          unit: "celsius",
        },
      }),
    );
    await store.add(
      createNewWeatherWatch({
        condition: {
          metric: "temperature",
          operator: "atLeast",
          threshold: 18,
          unit: "celsius",
        },
      }),
    );
    await store.add(
      createNewWeatherWatch({
        condition: {
          metric: "windSpeed",
          operator: "atLeast",
          threshold: 14,
          unit: "km/h",
        },
      }),
    );
    const delivered: NotificationDeliveryRequest[] = [];

    await processWeatherWatchEvaluationCycle({
      clock: { now: () => evaluationNow },
      delivery: {
        deliver: (notification) => {
          delivered.push(notification);
          return Promise.resolve();
        },
      },
      maxForecastAgeMs: 360 * 60_000,
      provider: createWeatherProviderFixture(),
      reportFailure: () => {},
      store,
    });

    expect(delivered.map(({ id }) => id)).toEqual([
      "weather-watch-cold",
      "weather-watch-wind",
    ]);
    expect(delivered[0]?.text).toContain("temperature is forecast at 17°C");
    expect(delivered[1]?.text).toContain("wind speed is forecast at 14 km/h");
    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({ status: "triggered" }),
      expect.objectContaining({ status: "active" }),
      expect.objectContaining({ status: "triggered" }),
    ]);
  });

  it("expires elapsed watches without consulting the provider", async () => {
    const store = createStore();
    await store.add(
      createNewWeatherWatch({
        period: {
          endAt: "2026-07-28T12:04:59.999Z",
          startAt: "2026-07-28T12:00:00.000Z",
        },
      }),
    );
    const provider = createWeatherProviderFixture();
    const getForecast = vi.fn();
    provider.getForecast = getForecast;

    await processWeatherWatchEvaluationCycle({
      clock: { now: () => evaluationNow },
      delivery: { deliver: vi.fn() },
      maxForecastAgeMs: 360 * 60_000,
      provider,
      reportFailure: () => {},
      store,
    });

    expect(getForecast).not.toHaveBeenCalled();
    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({
        status: "expired",
        terminalAt: evaluationNow.toISOString(),
      }),
    ]);
  });

  it("reports stale forecasts without presenting or consuming them", async () => {
    const store = createStore();
    await store.add(createNewWeatherWatch());
    const failures: unknown[] = [];
    const delivery = vi.fn();

    await processWeatherWatchEvaluationCycle({
      clock: { now: () => new Date("2026-07-28T18:01:00.000Z") },
      delivery: { deliver: delivery },
      maxForecastAgeMs: 360 * 60_000,
      provider: createWeatherProviderFixture(),
      reportFailure: (error) => {
        failures.push(error);
      },
      store,
    });

    expect(delivery).not.toHaveBeenCalled();
    expect(failures).toEqual([
      expect.objectContaining({
        message: "Weather watch forecast is stale.",
      }),
    ]);
    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({ status: "active" }),
    ]);
  });

  it("does not retry delivery after a persisted claim survives restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "weather-watch-evaluator-"));
    const filePath = join(directory, "weather-watches.json");
    const firstStore = createFileWeatherWatchStore({
      createId: () => "weather-watch-persisted",
      filePath,
      now: () => weatherWatchNow,
    });
    await firstStore.add(createNewWeatherWatch());
    const deliveryFailure = new Error("private output failure");
    const failures: unknown[] = [];
    const delivery = vi.fn(() => Promise.reject(deliveryFailure));
    const dependencies = {
      clock: { now: () => evaluationNow },
      delivery: { deliver: delivery },
      maxForecastAgeMs: 360 * 60_000,
      provider: createWeatherProviderFixture(),
      reportFailure: (error: unknown) => {
        failures.push(error);
      },
    };

    await processWeatherWatchEvaluationCycle({
      ...dependencies,
      store: firstStore,
    });
    await processWeatherWatchEvaluationCycle({
      ...dependencies,
      store: createFileWeatherWatchStore({
        filePath,
        now: () => evaluationNow,
      }),
    });

    expect(delivery).toHaveBeenCalledTimes(1);
    expect(failures).toEqual([deliveryFailure]);
  });

  it("keeps a durable claim when delivery and diagnostic reporting both fail", async () => {
    const store = createStore();
    await store.add(createNewWeatherWatch());

    await expect(
      processWeatherWatchEvaluationCycle({
        clock: { now: () => evaluationNow },
        delivery: {
          deliver: () => Promise.reject(new Error("private output failure")),
        },
        maxForecastAgeMs: 360 * 60_000,
        provider: createWeatherProviderFixture(),
        reportFailure: () => {
          throw new Error("private diagnostic failure");
        },
        store,
      }),
    ).resolves.toBeUndefined();
    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({ revision: 2, status: "triggered" }),
    ]);
  });
});

describe("runWeatherWatchEvaluator", () => {
  it("uses the canonical runtime timer when no test timer is injected", async () => {
    const shutdown = new AbortController();
    const wait = vi
      .spyOn(systemRuntimeBackgroundTaskTimer, "wait")
      .mockImplementation(() => {
        shutdown.abort();
        return Promise.resolve();
      });

    try {
      await runWeatherWatchEvaluator({
        clock: { now: () => evaluationNow },
        delivery: { deliver: vi.fn() },
        intervalMs: 15 * 60_000,
        maxForecastAgeMs: 360 * 60_000,
        provider: createWeatherProviderFixture(),
        reportFailure: () => {},
        shutdownSignal: shutdown.signal,
        store: createStore(),
      });

      expect(wait).toHaveBeenCalledExactlyOnceWith(
        15 * 60_000,
        shutdown.signal,
      );
    } finally {
      wait.mockRestore();
    }
  });

  it("uses bounded waits and exits through the active shutdown signal", async () => {
    const shutdown = new AbortController();
    const waits: number[] = [];
    const store = createStore();
    await store.add(
      createNewWeatherWatch({
        condition: {
          metric: "precipitation",
          operator: "atLeast",
          threshold: 1,
          unit: "mm",
        },
      }),
    );

    await runWeatherWatchEvaluator({
      clock: { now: () => evaluationNow },
      delivery: { deliver: vi.fn() },
      intervalMs: 15 * 60_000,
      maxForecastAgeMs: 360 * 60_000,
      provider: createWeatherProviderFixture(),
      reportFailure: () => {},
      shutdownSignal: shutdown.signal,
      store,
      timer: {
        wait: (delayMs, signal) => {
          waits.push(delayMs);
          expect(signal).toBe(shutdown.signal);
          shutdown.abort();
          return Promise.resolve();
        },
      },
    });

    expect(waits).toEqual([15 * 60_000]);
  });
});

function createStore() {
  return createInMemoryWeatherWatchStore({
    createId: () => "weather-watch-1",
    now: () => weatherWatchNow,
  });
}
