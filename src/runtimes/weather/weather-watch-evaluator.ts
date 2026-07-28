import type { ClockPort } from "../../ports/assistant.js";
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import {
  weatherWatchConditionMatches,
  weatherWatchConditionValue,
  weatherWatchMetricLabel,
} from "../../ports/weather-watch-condition-policy.js";
import { assertWeatherWatchActiveLimit } from "../../ports/weather-watch-policy.js";
import type {
  WeatherWatchCondition,
  WeatherWatchRecord,
  WeatherWatchStore,
} from "../../ports/weather-watch-store.js";
import type {
  HourlyWeatherForecast,
  WeatherAttribution,
  WeatherForecast,
  WeatherProviderPort,
  WeatherPeriod,
} from "../../ports/weather.js";
import {
  metricWeatherUnits,
  validateWeatherForecast,
  weatherForecastIsStale,
} from "../../ports/weather-policy.js";
import type { RuntimeBackgroundTaskTimer } from "../background-task.js";

interface WeatherWatchEvaluationDependencies {
  clock: ClockPort;
  delivery: NotificationDeliveryPort;
  maxForecastAgeMs: number;
  provider: WeatherProviderPort;
  reportFailure(error: unknown): void;
  shutdownSignal?: AbortSignal;
  store: WeatherWatchStore;
}

interface WeatherWatchEvaluatorDependencies extends WeatherWatchEvaluationDependencies {
  intervalMs: number;
  shutdownSignal: AbortSignal;
  timer?: RuntimeBackgroundTaskTimer;
}

interface ForecastGroup {
  watches: WeatherWatchRecord[];
}

interface QualifyingForecast {
  attribution: WeatherAttribution;
  forecast: HourlyWeatherForecast;
  window: WeatherPeriod;
}

const maxConcurrentForecastRequests = 4;
const systemWeatherWatchTimer: RuntimeBackgroundTaskTimer = {
  wait: (delayMs, shutdownSignal) =>
    waitForTimerOrShutdown(delayMs, shutdownSignal),
};

export async function runWeatherWatchEvaluator(
  dependencies: WeatherWatchEvaluatorDependencies,
): Promise<void> {
  while (!dependencies.shutdownSignal.aborted) {
    await processWeatherWatchEvaluationCycle(dependencies);
    if (dependencies.shutdownSignal.aborted) return;
    await (dependencies.timer ?? systemWeatherWatchTimer).wait(
      dependencies.intervalMs,
      dependencies.shutdownSignal,
    );
  }
}

export async function processWeatherWatchEvaluationCycle(
  dependencies: WeatherWatchEvaluationDependencies,
): Promise<void> {
  const watches = await dependencies.store.list();
  assertWeatherWatchActiveLimit(watches);
  const now = dependencies.clock.now();
  const eligible = await collectEligibleWatches(dependencies, watches, now);
  if (dependencies.shutdownSignal?.aborted) return;
  await processForecastGroups(
    dependencies,
    groupCompatibleWatches(eligible),
    now,
  );
}

async function collectEligibleWatches(
  dependencies: WeatherWatchEvaluationDependencies,
  watches: readonly WeatherWatchRecord[],
  now: Date,
): Promise<WeatherWatchRecord[]> {
  const eligible: WeatherWatchRecord[] = [];
  for (const watch of watches) {
    if (dependencies.shutdownSignal?.aborted) break;
    if (watch.status !== "active") continue;
    if (now.toISOString() <= watch.period.endAt) {
      eligible.push(watch);
      continue;
    }
    try {
      await dependencies.store.expire({
        expectedRevision: watch.revision,
        expiredAt: now.toISOString(),
        id: watch.id,
      });
    } catch (error) {
      reportFailureBestEffort(dependencies, error);
    }
  }
  return eligible;
}

function groupCompatibleWatches(
  watches: readonly WeatherWatchRecord[],
): ForecastGroup[] {
  const groups = new Map<string, ForecastGroup>();
  for (const watch of watches) {
    const key = JSON.stringify([
      watch.location.countryCode,
      watch.location.latitude,
      watch.location.longitude,
      watch.location.name,
      watch.location.timezone,
      watch.period.startAt,
      watch.period.endAt,
    ]);
    const existing = groups.get(key);
    if (existing) {
      existing.watches.push(watch);
    } else {
      groups.set(key, { watches: [watch] });
    }
  }
  return [...groups.values()];
}

async function processForecastGroups(
  dependencies: WeatherWatchEvaluationDependencies,
  groups: readonly ForecastGroup[],
  now: Date,
): Promise<void> {
  let nextIndex = 0;
  const worker = async () => {
    while (!dependencies.shutdownSignal?.aborted) {
      const group = groups[nextIndex];
      nextIndex += 1;
      if (!group) return;
      await processForecastGroup(dependencies, group, now);
    }
  };
  await Promise.all(
    Array.from(
      {
        length: Math.min(maxConcurrentForecastRequests, groups.length),
      },
      worker,
    ),
  );
}

async function processForecastGroup(
  dependencies: WeatherWatchEvaluationDependencies,
  group: ForecastGroup,
  now: Date,
): Promise<void> {
  const representative = group.watches[0];
  if (!representative) return;
  const forecast = await loadForecast(dependencies, representative, now);
  if (!forecast || dependencies.shutdownSignal?.aborted) return;
  for (const watch of group.watches) {
    if (dependencies.shutdownSignal?.aborted) return;
    const match = findQualifyingForecast(forecast, watch);
    if (!match) continue;
    try {
      const claimed = await dependencies.store.claimNotification({
        claimedAt: now.toISOString(),
        expectedRevision: watch.revision,
        id: watch.id,
        window: match.window,
      });
      if (!claimed) continue;
      await dependencies.delivery.deliver(
        {
          id: claimed.id,
          text: createNotificationText(claimed, match),
        },
        dependencies.shutdownSignal
          ? { shutdownSignal: dependencies.shutdownSignal }
          : {},
      );
    } catch (error) {
      reportFailureBestEffort(dependencies, error);
    }
  }
}

async function loadForecast(
  dependencies: WeatherWatchEvaluationDependencies,
  watch: WeatherWatchRecord,
  now: Date,
): Promise<WeatherForecast | undefined> {
  try {
    const forecast = await dependencies.provider.getForecast(
      {
        location: watch.location,
        period: watch.period,
        units: metricWeatherUnits,
      },
      dependencies.shutdownSignal
        ? { signal: dependencies.shutdownSignal }
        : {},
    );
    validateWeatherForecast(forecast, watch.location, watch.period);
    if (weatherForecastIsStale(forecast, now, dependencies.maxForecastAgeMs)) {
      throw new Error("Weather watch forecast is stale.");
    }
    return forecast;
  } catch (error) {
    reportFailureBestEffort(dependencies, error);
    return;
  }
}

function findQualifyingForecast(
  forecast: WeatherForecast,
  watch: WeatherWatchRecord,
): QualifyingForecast | undefined {
  const qualifying = forecast.hourly.find((item) =>
    weatherWatchConditionMatches(watch.condition, item),
  );
  if (!qualifying) return;
  return {
    attribution: forecast.attribution,
    forecast: qualifying,
    window: {
      endAt: new Date(
        Math.min(
          new Date(qualifying.forecastAt).getTime() + 60 * 60_000,
          new Date(watch.period.endAt).getTime(),
        ),
      ).toISOString(),
      startAt: qualifying.forecastAt,
    },
  };
}

function createNotificationText(
  watch: WeatherWatchRecord,
  match: QualifyingForecast,
): string {
  const value = weatherWatchConditionValue(watch.condition, match.forecast);
  return `Weather watch ${
    watch.id
  } matched in ${watch.location.name}: ${weatherWatchMetricLabel(
    watch.condition,
  )} is forecast at ${formatValue(value, watch.condition)} from ${
    match.window.startAt
  } to ${match.window.endAt}. Source: ${match.attribution.name} (${
    match.attribution.url
  }). Weather watches are convenience notifications, not guaranteed emergency alerts.`;
}

function formatValue(value: number, condition: WeatherWatchCondition): string {
  return condition.unit === "celsius"
    ? `${value}°C`
    : `${value} ${condition.unit}`;
}

function reportFailureBestEffort(
  dependencies: Pick<WeatherWatchEvaluationDependencies, "reportFailure">,
  error: unknown,
): void {
  try {
    dependencies.reportFailure(error);
  } catch {
    // Diagnostic sinks cannot change durable watch lifecycle progress.
  }
}

function waitForTimerOrShutdown(
  delayMs: number,
  shutdownSignal: AbortSignal,
): Promise<void> {
  if (shutdownSignal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      shutdownSignal.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = setTimeout(finish, delayMs);
    shutdownSignal.addEventListener("abort", finish, { once: true });
  });
}
