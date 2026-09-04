import type { AssistantPresentationProjection } from "../../ports/presentation.js";
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
}): Promise<AssistantPresentationProjection> {
  const day = localDate(options.now, options.config.assistant.timeZone);
  const [alarmRead, calendarRead, profileRead, taskRead] = await Promise.all([
    readSource(
      options.services.get(alarmStoreService),
      (store) => store.list(),
      options,
    ),
    readSource(
      options.services.get(calendarSearchService),
      (calendar) =>
        calendar.searchEvents(
          { endDate: day, startDate: day },
          { now: options.now },
        ),
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
    status: task.dueDate
      ? `${task.status} · due ${renderDate(task.dueDate)}`
      : task.status,
  }));
  const today = [
    ...calendarRead.value.map(
      (event) => `${event.startTime ?? "All day"} · ${event.title}`,
    ),
    ...alarms
      .filter((alarm) => alarm.status === "scheduled")
      .map((alarm) => `${alarm.scheduledFor} · ${alarm.label}`),
    ...tasks
      .filter((task) => task.status.startsWith("open"))
      .map((task) => task.label),
  ].slice(0, 50);
  const degraded = new Set([
    ...(alarmRead.failed ? ["alarms"] : []),
    ...(calendarRead.failed ? ["calendar"] : []),
    ...(profileRead.failed ? ["profile"] : []),
    ...(taskRead.failed ? ["tasks"] : []),
  ]);
  return {
    activity: [],
    alarms,
    integrations: Object.entries(options.config.features)
      .slice(0, 50)
      .map(([id, feature]) => ({
        label: readableIdentifier(id),
        status: feature.enabled
          ? degraded.has(id)
            ? "degraded"
            : "ready"
          : "disabled",
      })),
    interactions: [],
    profile: profileRead.value.slice(0, 50).map((fact) => ({
      field: fact.field,
      provenance: fact.provenance,
      value: fact.value,
    })),
    sources: [],
    tasks,
    today,
  };
}

async function readSource<TSource, TValue>(
  source: TSource | undefined,
  read: (source: TSource) => Promise<TValue[]>,
  options: { readonly reportFailure: (error: unknown) => void },
): Promise<{ failed: boolean; value: TValue[] }> {
  if (!source) return { failed: false, value: [] };
  try {
    return { failed: false, value: await read(source) };
  } catch (error) {
    options.reportFailure(error);
    return { failed: true, value: [] };
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
      }).format(parsed);
}

function readableIdentifier(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
