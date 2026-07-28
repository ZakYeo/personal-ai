import { createInMemoryWeatherWatchStore } from "../../adapters/local/in-memory-weather-watch-store.js";
import type { WeatherWatchStore } from "../../ports/weather-watch-store.js";
import type {
  WeatherForecastRequest,
  WeatherProviderPort,
  WeatherRequestOptions,
} from "../../ports/weather.js";
import { createWeatherProviderFixture } from "../../test-support/weather.js";
import {
  createNewWeatherWatch,
  weatherWatchNow,
} from "../../test-support/weather-watch-store.js";
import { processWeatherWatchEvaluationCycle } from "./weather-watch-evaluator.js";

const evaluationNow = new Date("2026-07-28T12:05:00.000Z");

describe("weather watch evaluation bounds", () => {
  it("shares one provider request across compatible watches", async () => {
    const store = createStore();
    await store.add(createNewWeatherWatch());
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
    const provider = createWeatherProviderFixture();
    const getForecast = vi.spyOn(provider, "getForecast");
    const delivered: string[] = [];

    await evaluate(store, provider, {
      deliver: ({ id }) => {
        delivered.push(id);
        return Promise.resolve();
      },
    });

    expect(getForecast).toHaveBeenCalledOnce();
    expect(delivered).toEqual(["weather-watch-1", "weather-watch-2"]);
  });

  it("limits independent provider requests to four at a time", async () => {
    const store = await createDistinctWatchStore(6);
    const tracker = createDeferredProvider();
    const evaluation = evaluate(store, tracker.provider);

    await vi.waitFor(() => {
      expect(tracker.getForecast).toHaveBeenCalledTimes(4);
    });
    expect(tracker.maximumActive()).toBe(4);
    tracker.releaseAll();
    await vi.waitFor(() => {
      expect(tracker.getForecast).toHaveBeenCalledTimes(6);
    });
    tracker.releaseAll();
    await evaluation;

    expect(tracker.maximumActive()).toBe(4);
  });

  it("does not start queued groups after shutdown", async () => {
    const store = await createDistinctWatchStore(6);
    const tracker = createDeferredProvider();
    const shutdown = new AbortController();
    const delivery = vi.fn();
    const evaluation = evaluate(
      store,
      tracker.provider,
      { deliver: delivery },
      shutdown.signal,
    );

    await vi.waitFor(() => {
      expect(tracker.getForecast).toHaveBeenCalledTimes(4);
    });
    shutdown.abort();
    tracker.releaseAll();
    await evaluation;

    expect(tracker.getForecast).toHaveBeenCalledTimes(4);
    expect(delivery).not.toHaveBeenCalled();
  });

  it("isolates one provider-group failure from other watches", async () => {
    const store = await createDistinctWatchStore(2);
    const base = createWeatherProviderFixture();
    const providerFailure = new Error("private first group failure");
    const provider: WeatherProviderPort = {
      ...base,
      getForecast: (request, options) =>
        request.period.endAt === "2026-07-29T10:00:00.000Z"
          ? Promise.reject(providerFailure)
          : base.getForecast(request, options),
    };
    const delivered: string[] = [];
    const failures: unknown[] = [];

    await evaluate(
      store,
      provider,
      {
        deliver: ({ id }) => {
          delivered.push(id);
          return Promise.resolve();
        },
      },
      undefined,
      failures,
    );

    expect(delivered).toEqual(["weather-watch-2"]);
    expect(failures).toEqual([providerFailure]);
  });
});

function createStore(): WeatherWatchStore {
  let id = 0;
  return createInMemoryWeatherWatchStore({
    createId: () => `weather-watch-${++id}`,
    now: () => weatherWatchNow,
  });
}

async function createDistinctWatchStore(
  count: number,
): Promise<WeatherWatchStore> {
  const store = createStore();
  for (let index = 0; index < count; index += 1) {
    await store.add(
      createNewWeatherWatch({
        period: {
          endAt: new Date(
            Date.parse("2026-07-29T10:00:00.000Z") + index * 60_000,
          ).toISOString(),
          startAt: "2026-07-29T08:00:00.000Z",
        },
      }),
    );
  }
  return store;
}

function evaluate(
  store: WeatherWatchStore,
  provider: WeatherProviderPort,
  delivery: {
    deliver(
      request: { id: string; text: string },
      options?: { shutdownSignal?: AbortSignal },
    ): Promise<void>;
  } = { deliver: () => Promise.resolve() },
  shutdownSignal?: AbortSignal,
  failures: unknown[] = [],
): Promise<void> {
  return processWeatherWatchEvaluationCycle({
    clock: { now: () => evaluationNow },
    delivery,
    maxForecastAgeMs: 360 * 60_000,
    provider,
    reportFailure: (error) => {
      failures.push(error);
    },
    ...(shutdownSignal ? { shutdownSignal } : {}),
    store,
  });
}

function createDeferredProvider(): {
  getForecast: ReturnType<typeof vi.fn>;
  maximumActive(): number;
  provider: WeatherProviderPort;
  releaseAll(): void;
} {
  const base = createWeatherProviderFixture();
  const releases: Array<() => void> = [];
  let active = 0;
  let maximumActive = 0;
  const getForecast = vi.fn(
    async (request: WeatherForecastRequest, options: WeatherRequestOptions) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => {
        releases.push(resolve);
      });
      try {
        return await base.getForecast(request, options);
      } finally {
        active -= 1;
      }
    },
  );
  return {
    getForecast,
    maximumActive: () => maximumActive,
    provider: { ...base, getForecast },
    releaseAll: () => {
      for (const release of releases.splice(0)) release();
    },
  };
}
