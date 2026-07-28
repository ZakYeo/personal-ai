import type {
  CancelWeatherWatchRequest,
  ClaimWeatherWatchNotificationRequest,
  ExpireWeatherWatchRequest,
  NewWeatherWatch,
  WeatherWatchRecord,
} from "../../ports/weather-watch-store.js";
import {
  assertValidNewWeatherWatch,
  assertValidWeatherWatchRecord,
  cloneNewWeatherWatch,
} from "../../ports/weather-watch-policy.js";

export function createActiveWeatherWatch(
  input: NewWeatherWatch,
  id: string,
  now: Date,
): WeatherWatchRecord {
  assertValidNewWeatherWatch(input);
  const timestamp = now.toISOString();
  const watch: WeatherWatchRecord = {
    ...cloneNewWeatherWatch(input),
    createdAt: timestamp,
    id,
    revision: 1,
    status: "active",
    updatedAt: timestamp,
  };
  assertValidWeatherWatchRecord(watch);
  return watch;
}

export function cancelWeatherWatch(
  watch: WeatherWatchRecord,
  request: CancelWeatherWatchRequest,
): WeatherWatchRecord | undefined {
  return transitionTerminal(
    watch,
    request.id,
    request.expectedRevision,
    request.cancelledAt,
    "cancelled",
  );
}

export function expireWeatherWatch(
  watch: WeatherWatchRecord,
  request: ExpireWeatherWatchRequest,
): WeatherWatchRecord | undefined {
  if (request.expiredAt < watch.period.endAt) {
    throw new Error("Weather watch state is invalid.");
  }
  return transitionTerminal(
    watch,
    request.id,
    request.expectedRevision,
    request.expiredAt,
    "expired",
  );
}

export function claimWeatherWatchNotification(
  watch: WeatherWatchRecord,
  request: ClaimWeatherWatchNotificationRequest,
): WeatherWatchRecord | undefined {
  if (
    watch.id !== request.id ||
    watch.revision !== request.expectedRevision ||
    watch.status !== "active"
  ) {
    return;
  }
  const claimed: WeatherWatchRecord = {
    ...watch,
    notification: {
      claimedAt: request.claimedAt,
      window: { ...request.window },
    },
    revision: watch.revision + 1,
    status: "triggered",
    terminalAt: request.claimedAt,
    updatedAt: request.claimedAt,
  };
  assertValidWeatherWatchRecord(claimed);
  return claimed;
}

function transitionTerminal(
  watch: WeatherWatchRecord,
  id: string,
  expectedRevision: number,
  updatedAt: string,
  status: "cancelled" | "expired" | "triggered",
): WeatherWatchRecord | undefined {
  if (
    watch.id !== id ||
    watch.revision !== expectedRevision ||
    watch.status !== "active"
  ) {
    return;
  }
  const transitioned: WeatherWatchRecord = {
    ...watch,
    revision: watch.revision + 1,
    status,
    terminalAt: updatedAt,
    updatedAt,
  };
  assertValidWeatherWatchRecord(transitioned);
  return transitioned;
}
