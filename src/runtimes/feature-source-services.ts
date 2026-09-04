import type { AlarmStore } from "../ports/alarm-store.js";
import type { CalendarSearchPort } from "../ports/calendar.js";
import type { InternetSearchPort } from "../ports/internet-search.js";
import type { TaskStore } from "../ports/task-store.js";
import type { WeatherProviderPort } from "../ports/weather.js";
import { defineRuntimeServiceToken } from "./runtime-service-registry.js";

export const alarmStoreService =
  defineRuntimeServiceToken<AlarmStore>("alarm store");
export const calendarSearchService =
  defineRuntimeServiceToken<CalendarSearchPort>("calendar search");
export const internetSearchService =
  defineRuntimeServiceToken<InternetSearchPort>("internet search");
export const taskStoreService =
  defineRuntimeServiceToken<TaskStore>("task store");
export const weatherProviderService =
  defineRuntimeServiceToken<WeatherProviderPort>("weather provider");
