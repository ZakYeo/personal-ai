import {
  createFeatureContext,
  executeFeature,
  expectCapabilityMetadata,
} from "../../test-support/feature-contract.js";
import { getDeterministicFeatureRules } from "../../application/deterministic-feature-rules.js";
import { createWeatherProviderFixture } from "../../test-support/weather.js";
import { createWeatherWatchStoreFixture } from "../../test-support/weather-watch-store.js";
import { createWeatherFeature } from "./weather-feature.js";

const now = new Date("2026-07-28T12:00:00.000Z");
const context = {
  ...createFeatureContext(),
  clock: { now: () => now },
};

describe("weather watch capabilities", () => {
  it("routes one exact bounded rain-watch fixture without changing timestamp case", () => {
    const rule = getDeterministicFeatureRules(createWeatherWatchFeature()).find(
      ({ capability }) => capability === "weather.watch.create",
    );

    expect(
      rule?.match(
        "watch for rain in london from 2026-07-28t12:00:00.000z to 2026-07-29t12:00:00.000z",
      ),
    ).toEqual({
      endAt: "2026-07-29T12:00:00.000Z",
      location: "london",
      metric: "precipitation",
      operator: "atLeast",
      startAt: "2026-07-28T12:00:00.000Z",
      threshold: 0.1,
    });
  });

  it("declares confirmed create and cancel writes plus a low-risk list read", () => {
    const feature = createWeatherWatchFeature();

    expectCapabilityMetadata(feature, {
      name: "weather.watch.create",
      risk: "high",
    });
    expectCapabilityMetadata(feature, {
      name: "weather.watch.list",
      risk: "low",
    });
    expectCapabilityMetadata(feature, {
      name: "weather.watch.cancel",
      risk: "high",
    });
    expect(
      feature.capabilities.find(({ name }) => name === "weather.watch.create"),
    ).toMatchObject({ requiresConfirmation: true });
    expect(
      feature.capabilities.find(({ name }) => name === "weather.watch.cancel"),
    ).toMatchObject({ requiresConfirmation: true });
  });

  it("renders every material decoded creation fact for confirmation", () => {
    const capability = createWeatherWatchFeature().capabilities.find(
      ({ name }) => name === "weather.watch.create",
    );

    expect(
      capability?.renderConfirmation?.(
        {
          endAt: "2026-07-29T12:00:00.000Z",
          location: "London",
          metric: "precipitation",
          operator: "atLeast",
          startAt: "2026-07-28T12:00:00.000Z",
          threshold: 0.1,
        },
        context,
      ),
    ).toEqual({
      facts: {
        endAt: "2026-07-29T12:00:00.000Z",
        location: "London",
        metric: "precipitation",
        operator: "atLeast",
        startAt: "2026-07-28T12:00:00.000Z",
        threshold: 0.1,
        unit: "mm",
      },
      text: "create a weather watch for precipitation at least 0.1 mm in London from 2026-07-28T12:00:00.000Z to 2026-07-29T12:00:00.000Z",
    });
  });

  it("persists a resolved explicit-location snapshot with protected facts", async () => {
    const store = createStore();
    const feature = createWeatherFeature(createWeatherProviderFixture(), {
      watchStore: store,
    });

    const result = await executeFeature(
      feature,
      "weather.watch.create",
      {
        endAt: "2026-07-29T12:00:00.000Z",
        location: "London",
        metric: "precipitation",
        operator: "atLeast",
        startAt: "2026-07-28T12:00:00.000Z",
        threshold: 0.1,
      },
      context,
    );

    expect(result.text).toContain(
      "Created weather watch weather-watch-1 for precipitation at least 0.1 mm in London",
    );
    expect(result.text).toContain(
      "Weather watches are convenience notifications, not guaranteed emergency alerts.",
    );
    expect(result.data).toEqual({
      conditionMetric: "precipitation",
      conditionOperator: "atLeast",
      conditionThreshold: 0.1,
      conditionUnit: "mm",
      countryCode: "GB",
      createdAt: "2026-07-28T12:00:00.000Z",
      id: "weather-watch-1",
      latitude: 51.5074,
      location: "London",
      longitude: -0.1278,
      periodEndAt: "2026-07-29T12:00:00.000Z",
      periodStartAt: "2026-07-28T12:00:00.000Z",
      revision: 1,
      status: "active",
      timezone: "Europe/London",
      updatedAt: "2026-07-28T12:00:00.000Z",
    });
    const stored = await store.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      condition: {
        metric: "precipitation",
        operator: "atLeast",
        threshold: 0.1,
        unit: "mm",
      },
      location: {
        name: "London",
        timezone: "Europe/London",
      },
      status: "active",
    });
  });

  it("rejects unsupported conditions before writing state", async () => {
    const store = createStore();

    await expect(
      executeFeature(
        createWeatherFeature(createWeatherProviderFixture(), {
          watchStore: store,
        }),
        "weather.watch.create",
        {
          endAt: "2026-07-29T12:00:00.000Z",
          location: "London",
          metric: "humidity",
          operator: "atLeast",
          startAt: "2026-07-28T12:00:00.000Z",
          threshold: 50,
        },
        context,
      ),
    ).rejects.toThrow("Weather watch condition is invalid.");
    await expect(store.list()).resolves.toEqual([]);
  });

  it("clarifies unavailable and ambiguous locations without writing", async () => {
    const store = createStore();
    const provider = createWeatherProviderFixture();
    provider.findLocations = () =>
      Promise.resolve([
        {
          countryName: "United Kingdom",
          location: {
            countryCode: "GB",
            latitude: 51.5,
            longitude: -0.1,
            name: "London, England",
            timezone: "Europe/London",
          },
          providerRank: 1,
          searchName: "London",
        },
        {
          countryName: "Canada",
          location: {
            countryCode: "CA",
            latitude: 42.98,
            longitude: -81.25,
            name: "London, Ontario",
            timezone: "America/Toronto",
          },
          providerRank: 2,
          searchName: "London",
        },
      ]);

    await expect(
      executeFeature(
        createWeatherFeature(provider, { watchStore: store }),
        "weather.watch.create",
        createWatchArgs(),
        context,
      ),
    ).resolves.toEqual({
      kind: "resumable_clarification",
      parameter: "location",
      text: "I found multiple locations for London: London, England (GB), London, Ontario (CA). Which one did you mean?",
    });
    await expect(store.list()).resolves.toEqual([]);
  });

  it("lists exact watch state and cancels the latest eligible revision", async () => {
    const store = createStore();
    const feature = createWeatherFeature(createWeatherProviderFixture(), {
      watchStore: store,
    });
    await executeFeature(
      feature,
      "weather.watch.create",
      createWatchArgs(),
      context,
    );

    const listed = await executeFeature(
      feature,
      "weather.watch.list",
      {},
      context,
    );
    expect(listed.text).toContain(
      "weather-watch-1: active precipitation at least 0.1 mm in London",
    );
    expect(listed.data).toMatchObject({
      watch0ConditionMetric: "precipitation",
      watch0ConditionThreshold: 0.1,
      watch0Id: "weather-watch-1",
      watch0Location: "London",
      watch0Revision: 1,
      watch0Status: "active",
      watchCount: 1,
    });

    const cancelled = await executeFeature(
      feature,
      "weather.watch.cancel",
      { id: "weather-watch-1" },
      {
        ...context,
        clock: { now: () => new Date("2026-07-28T12:01:00.000Z") },
      },
    );
    expect(cancelled).toEqual({
      data: {
        id: "weather-watch-1",
        revision: 2,
        status: "cancelled",
        terminalAt: "2026-07-28T12:01:00.000Z",
        updatedAt: "2026-07-28T12:01:00.000Z",
      },
      text: "Cancelled weather watch weather-watch-1 at 2026-07-28T12:01:00.000Z.",
    });
  });

  it("does not cancel missing or already-terminal watches", async () => {
    const feature = createWeatherWatchFeature();

    await expect(
      executeFeature(
        feature,
        "weather.watch.cancel",
        { id: "weather-watch-missing" },
        context,
      ),
    ).resolves.toEqual({
      text: "I could not find an active weather watch with ID weather-watch-missing.",
    });
  });
});

function createStore() {
  return createWeatherWatchStoreFixture({
    createId: () => "weather-watch-1",
    now: () => now,
  });
}

function createWeatherWatchFeature() {
  return createWeatherFeature(createWeatherProviderFixture(), {
    watchStore: createStore(),
  });
}

function createWatchArgs() {
  return {
    endAt: "2026-07-29T12:00:00.000Z",
    location: "London",
    metric: "precipitation",
    operator: "atLeast",
    startAt: "2026-07-28T12:00:00.000Z",
    threshold: 0.1,
  };
}
