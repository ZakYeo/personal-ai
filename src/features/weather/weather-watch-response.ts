import type {
  WeatherWatchCondition,
  WeatherWatchRecord,
} from "../../ports/weather-watch-store.js";
import { weatherWatchMetricLabel } from "../../application/weather-watch-condition-policy.js";

const weatherWatchReliabilityNotice =
  "Weather watches are convenience notifications, not guaranteed emergency alerts.";

export function createdWeatherWatchResult(watch: WeatherWatchRecord) {
  return {
    data: weatherWatchData(watch),
    spokenText: weatherWatchSpokenText(watch.location.timezone),
    text: `Created weather watch ${watch.id} for ${formatWeatherWatchCondition(
      watch.condition,
    )} in ${watch.location.name} from ${watch.period.startAt} to ${
      watch.period.endAt
    }. ${weatherWatchReliabilityNotice}`,
  };
}

export function listWeatherWatchesResult(
  watches: readonly WeatherWatchRecord[],
) {
  if (watches.length === 0) {
    return { text: "You have no weather watches." };
  }
  return {
    data: {
      watchCount: watches.length,
      ...Object.fromEntries(
        watches.flatMap((watch, index) =>
          Object.entries(weatherWatchData(watch)).map(([key, value]) => [
            `watch${index}${capitalize(key)}`,
            value,
          ]),
        ),
      ),
    },
    ...sharedWeatherWatchSpokenText(watches),
    text: `Your weather watches are ${watches
      .map(
        (watch) =>
          `${watch.id}: ${watch.status} ${formatWeatherWatchCondition(
            watch.condition,
          )} in ${watch.location.name} from ${watch.period.startAt} to ${
            watch.period.endAt
          }`,
      )
      .join(", ")}. ${weatherWatchReliabilityNotice}`,
  };
}

function weatherWatchSpokenText(timeZone: string) {
  return { dateStyle: "contextual" as const, timeZone };
}

function sharedWeatherWatchSpokenText(
  watches: readonly WeatherWatchRecord[],
): { spokenText: ReturnType<typeof weatherWatchSpokenText> } | undefined {
  const timeZones = new Set(watches.map((watch) => watch.location.timezone));
  const timeZone = timeZones.size === 1 ? [...timeZones][0] : undefined;
  return timeZone
    ? { spokenText: weatherWatchSpokenText(timeZone) }
    : undefined;
}

export function formatWeatherWatchCondition(
  condition: WeatherWatchCondition,
): string {
  return `${weatherWatchMetricLabel(condition)} ${
    condition.operator === "atLeast" ? "at least" : "at most"
  } ${condition.threshold} ${condition.unit}`;
}

function weatherWatchData(watch: WeatherWatchRecord) {
  return {
    conditionMetric: watch.condition.metric,
    conditionOperator: watch.condition.operator,
    conditionThreshold: watch.condition.threshold,
    conditionUnit: watch.condition.unit,
    countryCode: watch.location.countryCode,
    createdAt: watch.createdAt,
    id: watch.id,
    latitude: watch.location.latitude,
    location: watch.location.name,
    longitude: watch.location.longitude,
    periodEndAt: watch.period.endAt,
    periodStartAt: watch.period.startAt,
    revision: watch.revision,
    status: watch.status,
    timezone: watch.location.timezone,
    ...(watch.terminalAt ? { terminalAt: watch.terminalAt } : {}),
    ...(watch.notification
      ? {
          notificationClaimedAt: watch.notification.claimedAt,
          notificationWindowEndAt: watch.notification.window.endAt,
          notificationWindowStartAt: watch.notification.window.startAt,
        }
      : {}),
    updatedAt: watch.updatedAt,
  };
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
