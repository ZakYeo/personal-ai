import type { DeterministicFeatureRule } from "../../ports/deterministic-feature-rules.js";
import {
  defineCapability,
  type FeatureArgsFromParameters,
  type FeatureCapabilityParameters,
  type FeatureExecutionContext,
} from "../../ports/feature.js";
import type {
  WeatherWatchCondition,
  WeatherWatchStore,
} from "../../ports/weather-watch-store.js";
import { assertValidWeatherWatchCondition } from "../../ports/weather-watch-policy.js";
import type { WeatherProviderPort } from "../../ports/weather.js";
import { metricWeatherUnits } from "../../ports/weather-policy.js";
import { resolveWeatherLocation } from "./weather-location-resolution.js";
import { createForecastWeatherPeriod } from "./weather-validation.js";
import {
  createdWeatherWatchResult,
  formatWeatherWatchCondition,
  listWeatherWatchesResult,
} from "./weather-watch-response.js";

const createParameters = {
  endAt: {
    description: "Required inclusive watch-window end as an ISO timestamp.",
    required: true,
    type: "string",
  },
  location: {
    description: "Required explicit place name. Never infer a location.",
    required: true,
    type: "string",
  },
  metric: {
    description: "One of precipitation, temperature, or windSpeed.",
    required: true,
    type: "string",
  },
  operator: {
    description: "atLeast for any metric, or atMost for temperature only.",
    required: true,
    type: "string",
  },
  startAt: {
    description: "Required watch-window start as an ISO timestamp.",
    required: true,
    type: "string",
  },
  threshold: { required: true, type: "number" },
} as const satisfies FeatureCapabilityParameters;
type CreateArgs = FeatureArgsFromParameters<typeof createParameters>;

const cancelParameters = {
  id: { required: true, type: "string" },
} as const satisfies FeatureCapabilityParameters;
type CancelArgs = FeatureArgsFromParameters<typeof cancelParameters>;

const listParameters = {} as const satisfies FeatureCapabilityParameters;

export function createWeatherWatchCapabilities(
  provider: WeatherProviderPort,
  store: WeatherWatchStore,
) {
  return {
    "weather.watch.cancel": defineCapability({
      confirmation: (args) => ({
        facts: { id: args.id.trim() },
        text: `cancel weather watch ${args.id.trim()}`,
      }),
      description:
        "Cancel one active weather watch by exact ID. This requires confirmation.",
      execute: (request, context) =>
        cancelWeatherWatch(request.args, context, store),
      parameters: cancelParameters,
      requiresConfirmation: true,
      risk: "high",
      spokenSummary: "manage weather watches",
      summary: "Cancel an active weather watch.",
    }),
    "weather.watch.create": defineCapability({
      confirmation: (args) => {
        const condition = parseCondition(args);
        const location = args.location.trim();
        return {
          facts: {
            endAt: args.endAt,
            location,
            metric: condition.metric,
            operator: condition.operator,
            startAt: args.startAt,
            threshold: condition.threshold,
            unit: condition.unit,
          },
          text: `create a weather watch for ${formatWeatherWatchCondition(
            condition,
          )} in ${location} from ${args.startAt} to ${args.endAt}`,
        };
      },
      description:
        "Create a bounded one-shot convenience notification for an exact rain, temperature, or wind condition at an explicit place. This requires confirmation.",
      execute: (request, context) =>
        createWeatherWatch(provider, store, request.args, context),
      parameters: createParameters,
      requiresConfirmation: true,
      risk: "high",
      spokenSummary: "manage weather watches",
      summary: "Create a bounded weather watch.",
    }),
    "weather.watch.list": defineCapability({
      description:
        "List weather watches and their exact status, condition, location, and period.",
      execute: () => listWeatherWatches(store),
      parameters: listParameters,
      risk: "low",
      spokenSummary: "manage weather watches",
      summary: "List weather watches.",
      toolChain: "read",
    }),
  };
}

export const weatherWatchDeterministicRules = [
  {
    capability: "weather.watch.create",
    match: (text) => {
      const match =
        /^watch for rain in (?<location>.+) from (?<startAt>\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d{3})?z) to (?<endAt>\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d{3})?z)$/u.exec(
          text,
        );
      const { endAt, location, startAt } = match?.groups ?? {};
      if (!endAt || !location || !startAt) return;
      return {
        endAt: canonicalizeNormalizedTimestamp(endAt),
        location,
        metric: "precipitation",
        operator: "atLeast",
        startAt: canonicalizeNormalizedTimestamp(startAt),
        threshold: 0.1,
      };
    },
  },
  {
    capability: "weather.watch.list",
    match: (text) =>
      /\b(?:list|show) (?:my )?weather watches\b/u.test(text) ? {} : undefined,
  },
  {
    capability: "weather.watch.cancel",
    match: (text) => {
      const match = /\bcancel weather watch (?<id>weather-watch-\S+)\b/u.exec(
        text,
      );
      return match?.groups?.id ? { id: match.groups.id } : undefined;
    },
  },
] as const satisfies readonly DeterministicFeatureRule[];

function canonicalizeNormalizedTimestamp(timestamp: string): string {
  return `${timestamp.slice(0, 10)}T${timestamp.slice(11, -1)}Z`;
}

async function createWeatherWatch(
  provider: WeatherProviderPort,
  store: WeatherWatchStore,
  args: CreateArgs,
  context: FeatureExecutionContext,
) {
  const condition = parseCondition(args);
  const period = createForecastWeatherPeriod(args, context.clock.now());
  const resolution = await resolveWeatherLocation(
    provider,
    args.location,
    context,
  );
  if ("result" in resolution) return resolution.result;
  const watch = await store.add({
    condition,
    location: resolution.location,
    period,
  });
  return createdWeatherWatchResult(watch);
}

async function listWeatherWatches(store: WeatherWatchStore) {
  return listWeatherWatchesResult(await store.list());
}

async function cancelWeatherWatch(
  args: CancelArgs,
  context: FeatureExecutionContext,
  store: WeatherWatchStore,
) {
  const id = args.id.trim();
  const current = (await store.list()).find(
    (watch) => watch.id === id && watch.status === "active",
  );
  if (!current) {
    return {
      text: `I could not find an active weather watch with ID ${id}.`,
    };
  }
  const timestamp = context.clock.now().toISOString();
  const cancelled = await store.cancel({
    cancelledAt: timestamp,
    expectedRevision: current.revision,
    id: current.id,
  });
  if (!cancelled) {
    return {
      text: `Weather watch ${id} changed before I could cancel it.`,
    };
  }
  return {
    data: {
      id: cancelled.id,
      revision: cancelled.revision,
      status: cancelled.status,
      terminalAt: cancelled.terminalAt,
      updatedAt: cancelled.updatedAt,
    },
    text: `Cancelled weather watch ${cancelled.id} at ${cancelled.terminalAt}.`,
  };
}

function parseCondition(args: {
  metric: string;
  operator: string;
  threshold: number;
}): WeatherWatchCondition {
  let condition: WeatherWatchCondition;
  if (args.metric === "precipitation" && args.operator === "atLeast") {
    condition = {
      metric: args.metric,
      operator: args.operator,
      threshold: args.threshold,
      unit: metricWeatherUnits.precipitation,
    };
  } else if (
    args.metric === "temperature" &&
    (args.operator === "atLeast" || args.operator === "atMost")
  ) {
    condition = {
      metric: args.metric,
      operator: args.operator,
      threshold: args.threshold,
      unit: metricWeatherUnits.temperature,
    };
  } else if (args.metric === "windSpeed" && args.operator === "atLeast") {
    condition = {
      metric: args.metric,
      operator: args.operator,
      threshold: args.threshold,
      unit: metricWeatherUnits.windSpeed,
    };
  } else {
    throw new Error("Weather watch condition is invalid.");
  }
  assertValidWeatherWatchCondition(condition);
  return condition;
}
