import type {
  AssistantPresentationProjection,
  PresentationProfileItem,
} from "../../ports/presentation.js";
import type { ProfileFact } from "../../ports/profile-store.js";
import type { TaskRecord } from "../../ports/task-store.js";
import { calendarLocalDayWindow } from "../../application/calendar-local-day.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
import {
  alarmStoreService,
  calendarSearchService,
  taskStoreService,
} from "../feature-source-services.js";
import { profileStoreService } from "../profile-runtime-services.js";
import type { RuntimeServiceRegistry } from "../runtime-service-registry.js";

export async function readPresentationProjection(options: {
  readonly config: LoadedRuntimeConfig;
  readonly now: Date;
  readonly reportFailure: (error: unknown) => void;
  readonly services: RuntimeServiceRegistry;
  readonly projectProfile: (
    facts: readonly ProfileFact[],
  ) => readonly PresentationProfileItem[];
}): Promise<AssistantPresentationProjection> {
  const day = localDate(options.now, options.config.assistant.timeZone);
  const calendarCriteria = {
    localDay: { date: day, timeZone: options.config.assistant.timeZone },
  };
  const calendarWindow = calendarLocalDayWindow(calendarCriteria)!;
  const [alarmRead, calendarRead, profileRead, taskRead] = await Promise.all([
    readSource(
      options.services.get(alarmStoreService),
      (store) => store.list(),
      options,
    ),
    readSource(
      options.services.get(calendarSearchService),
      (calendar) =>
        calendar.searchEvents(calendarCriteria, { now: options.now }),
      options,
    ),
    readSource(
      options.services.get(profileStoreService),
      (store) => store.list(),
      options,
    ),
    readSource(
      options.services.get(taskStoreService),
      (store) => store.listTasks(),
      options,
    ),
  ]);
  const alarms = alarmRead.value.slice(0, 100).map((alarm) => ({
    id: alarm.id,
    label: alarm.label,
    scheduledFor: renderDateTime(
      alarm.scheduledFor,
      options.config.assistant.timeZone,
    ),
    status: alarm.status,
  }));
  const tasks = taskRead.value.slice(0, 100).map((task) => ({
    id: task.id,
    label: task.label,
    status: taskPresentationStatus(task, day),
  }));
  const today = [
    ...calendarRead.value
      .filter(calendarWindow.matches)
      .map(
        (event) =>
          `${event.startAt ? renderDateTime(event.startAt, options.config.assistant.timeZone) : "All day"} · ${event.title}`,
      ),
    ...alarmRead.value
      .filter(
        (alarm) =>
          alarm.status === "scheduled" &&
          localDate(
            new Date(alarm.scheduledFor),
            options.config.assistant.timeZone,
          ) === day,
      )
      .map(
        (alarm) =>
          `${renderDateTime(alarm.scheduledFor, options.config.assistant.timeZone)} · ${alarm.label}`,
      ),
    ...taskRead.value
      .filter((task) => task.status === "open" && task.dueDate === day)
      .map((task) => task.label),
  ].slice(0, 50);
  const checks = new Map<string, { checked: boolean; failed: boolean }>([
    ["alarms", alarmRead],
    ["calendar", calendarRead],
    ["profile", profileRead],
    ["tasks", taskRead],
  ]);
  return {
    activity: [],
    alarms,
    integrations: Object.entries(options.config.features)
      .slice(0, 50)
      .map(([id, feature]) => {
        const check = feature.enabled ? checks.get(id) : undefined;
        return {
          label: readableIdentifier(id),
          lastCheck: check?.checked
            ? renderDateTime(
                options.now.toISOString(),
                options.config.assistant.timeZone,
              )
            : "Not checked",
          status: !feature.enabled
            ? "disabled"
            : !check
              ? "configured"
              : !check.checked
                ? "unchecked"
                : check.failed
                  ? "degraded"
                  : "connected",
        };
      }),
    interactions: [],
    profile: options.projectProfile(profileRead.value),
    sources: [],
    tasks,
    today,
  };
}

async function readSource<TSource, TValue>(
  source: TSource | undefined,
  read: (source: TSource) => Promise<TValue[]>,
  options: { readonly reportFailure: (error: unknown) => void },
): Promise<{ checked: boolean; failed: boolean; value: TValue[] }> {
  if (!source) return { checked: false, failed: false, value: [] };
  try {
    return { checked: true, failed: false, value: await read(source) };
  } catch (error) {
    options.reportFailure(error);
    return { checked: true, failed: true, value: [] };
  }
}

function localDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function renderDateTime(value: string, timeZone: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Scheduled"
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        timeZone,
      }).format(parsed);
}

function renderDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? "scheduled date"
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(parsed);
}

function taskPresentationStatus(task: TaskRecord, day: string): string {
  if (!task.dueDate) return `${task.status} · undated`;
  const due = `due ${renderDate(task.dueDate)}`;
  if (task.status !== "open") return `${task.status} · ${due}`;
  if (task.dueDate === day) return "open · due today";
  return `open · ${task.dueDate < day ? "overdue" : "future"} · ${due}`;
}

function readableIdentifier(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
