import type {
  AttentionCandidate,
  AttentionSourceReaderPort,
} from "../ports/attention.js";
import type { CalendarSearchPort } from "../ports/calendar.js";
import type { TaskStore } from "../ports/task-store.js";
import type { WeatherProviderPort } from "../ports/weather.js";
import { readCalendarAttention } from "./attention-calendar-source.js";
import { zonedParts } from "./local-date-time.js";
import {
  metricWeatherUnits,
  validateWeatherForecast,
  weatherForecastIsStale,
} from "./weather-policy.js";
import {
  weatherWatchConditionMatches,
  weatherWatchConditionValue,
  weatherWatchMetricLabel,
} from "./weather-watch-condition-policy.js";

interface AttentionSources {
  calendar?: Pick<CalendarSearchPort, "searchEvents">;
  tasks?: Pick<TaskStore, "listTasks">;
  weather?: Pick<WeatherProviderPort, "getForecast">;
  health?: { read(now: Date): Promise<readonly AttentionCandidate[]> };
  morning?: {
    read(
      now: Date,
      timeZone: string,
      signal?: AbortSignal,
    ): Promise<readonly AttentionCandidate[]>;
  };
}
export function createAttentionSourceReader(
  sources: AttentionSources,
): AttentionSourceReaderPort {
  return {
    read: async ({ definition, timeZone }, { now, signal }) => {
      if (signal?.aborted) return [];
      switch (definition.kind) {
        case "upcoming_calendar":
        case "conflicting_commitments":
          return readCalendarAttention(
            required(sources.calendar),
            definition,
            now,
            timeZone,
          );
        case "due_tasks": {
          const date = zonedParts(now, timeZone);
          const cutoff = new Date(
            Date.UTC(
              date.year,
              date.month - 1,
              date.day + definition.daysAhead,
            ),
          )
            .toISOString()
            .slice(0, 10);
          return (await required(sources.tasks).listTasks())
            .filter(
              (task) =>
                task.status === "open" &&
                task.dueDate &&
                task.dueDate <= cutoff,
            )
            .sort(
              (a, b) =>
                a.dueDate!.localeCompare(b.dueDate!) ||
                a.id.localeCompare(b.id),
            )
            .slice(0, 10)
            .map((task) => ({
              key: `${task.id}:${task.dueDate}`,
              text: `${task.label} is due ${task.dueDate}.`,
              explanation:
                "An open task is due within your chosen planning window.",
              timeZone,
              facts: { label: task.label, dueDate: task.dueDate! },
            }));
        }
        case "material_weather": {
          const period = {
            startAt: now.toISOString(),
            endAt: new Date(
              now.getTime() + definition.periodHours * 3_600_000,
            ).toISOString(),
          };
          const forecast = await required(sources.weather).getForecast(
            {
              location: definition.location,
              period,
              units: metricWeatherUnits,
            },
            { ...(signal ? { signal } : {}) },
          );
          validateWeatherForecast(forecast, definition.location, period);
          if (
            weatherForecastIsStale(forecast, now, 60 * 60_000) ||
            Math.abs(Date.parse(forecast.fetchedAt) - now.getTime()) >
              60 * 60_000
          )
            throw new Error("Attention weather forecast is not fresh.");
          const matched = forecast.hourly.find((hour) =>
            weatherWatchConditionMatches(definition.condition, hour),
          );
          if (!matched) return [];
          return [
            {
              key: `${definition.location.latitude}:${definition.location.longitude}:${matched.forecastAt}`,
              text: `${weatherWatchMetricLabel(definition.condition)} is forecast to reach ${weatherWatchConditionValue(definition.condition, matched)} ${definition.condition.unit} in ${definition.location.name} at ${matched.forecastAt}. Forecast from ${forecast.attribution.name}. This is a convenience notice, not an emergency alert.`,
              explanation:
                "The forecast meets your explicit weather threshold during the selected period.",
              timeZone: definition.location.timezone,
              facts: {
                location: definition.location.name,
                latitude: definition.location.latitude,
                longitude: definition.location.longitude,
                timeZone: definition.location.timezone,
                periodStartAt: period.startAt,
                periodEndAt: period.endAt,
                fetchedAt: forecast.fetchedAt,
                observedAt: forecast.current.observedAt,
                forecastAt: matched.forecastAt,
                metric: definition.condition.metric,
                operator: definition.condition.operator,
                threshold: definition.condition.threshold,
                value: weatherWatchConditionValue(
                  definition.condition,
                  matched,
                ),
                unit: definition.condition.unit,
                attribution: forecast.attribution.name,
              },
            },
          ];
        }
        case "runtime_health":
          return required(sources.health).read(now);
        case "morning_routine": {
          const local = zonedParts(now, timeZone);
          const time = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
          if (time !== definition.localTime) return [];
          return required(sources.morning).read(now, timeZone, signal);
        }
      }
    },
  };
}
function required<T>(source: T | undefined): T {
  if (!source) throw new Error("The selected attention source is unavailable.");
  return source;
}
