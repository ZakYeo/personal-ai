import type { ClockPort } from "../../ports/assistant.js";
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import type {
  WeatherWatchCondition,
  WeatherWatchRecord,
  WeatherWatchStore,
} from "../../ports/weather-watch-store.js";
import type {
  HourlyWeatherForecast,
  WeatherAttribution,
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

interface QualifyingForecast {
  attribution: WeatherAttribution;
  forecast: HourlyWeatherForecast;
  window: WeatherPeriod;
}

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
  const now = dependencies.clock.now();

  for (const watch of watches) {
    if (dependencies.shutdownSignal?.aborted) return;
    if (watch.status !== "active") continue;
    if (now.toISOString() > watch.period.endAt) {
      await dependencies.store.expire({
        expectedRevision: watch.revision,
        expiredAt: now.toISOString(),
        id: watch.id,
      });
      continue;
    }

    const match = await loadQualifyingForecast(dependencies, watch, now);
    if (!match || dependencies.shutdownSignal?.aborted) continue;
    const claimed = await dependencies.store.claimNotification({
      claimedAt: now.toISOString(),
      expectedRevision: watch.revision,
      id: watch.id,
      window: match.window,
    });
    if (!claimed) continue;

    try {
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

async function loadQualifyingForecast(
  dependencies: WeatherWatchEvaluationDependencies,
  watch: WeatherWatchRecord,
  now: Date,
): Promise<QualifyingForecast | undefined> {
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
    const qualifying = [...forecast.hourly]
      .filter(
        (item) =>
          item.forecastAt >= watch.period.startAt &&
          item.forecastAt <= watch.period.endAt &&
          conditionMatches(watch.condition, item),
      )
      .sort((left, right) =>
        left.forecastAt.localeCompare(right.forecastAt),
      )[0];
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
  } catch (error) {
    reportFailureBestEffort(dependencies, error);
    return;
  }
}

function conditionMatches(
  condition: WeatherWatchCondition,
  forecast: HourlyWeatherForecast,
): boolean {
  switch (condition.metric) {
    case "precipitation":
      return forecast.precipitation >= condition.threshold;
    case "temperature":
      return condition.operator === "atLeast"
        ? forecast.temperature >= condition.threshold
        : forecast.temperature <= condition.threshold;
    case "windSpeed":
      return forecast.windSpeed >= condition.threshold;
  }
}

function createNotificationText(
  watch: WeatherWatchRecord,
  match: QualifyingForecast,
): string {
  const value = forecastMetricValue(watch.condition, match.forecast);
  return `Weather watch ${watch.id} matched in ${watch.location.name}: ${metricLabel(
    watch.condition,
  )} is forecast at ${formatValue(value, watch.condition)} from ${
    match.window.startAt
  } to ${match.window.endAt}. Source: ${match.attribution.name} (${
    match.attribution.url
  }). Weather watches are convenience notifications, not guaranteed emergency alerts.`;
}

function forecastMetricValue(
  condition: WeatherWatchCondition,
  forecast: HourlyWeatherForecast,
): number {
  switch (condition.metric) {
    case "precipitation":
      return forecast.precipitation;
    case "temperature":
      return forecast.temperature;
    case "windSpeed":
      return forecast.windSpeed;
  }
}

function metricLabel(condition: WeatherWatchCondition): string {
  return condition.metric === "windSpeed" ? "wind speed" : condition.metric;
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
