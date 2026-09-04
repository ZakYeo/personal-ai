import {
  resolveLocalDateTime,
  zonedParts,
} from "../../application/local-date-time.js";
import type { ClockPort } from "../../ports/assistant.js";
import type {
  BriefingPreferences,
  BriefingSchedule,
  BriefingStore,
  DailyBriefingAggregatorPort,
} from "../../ports/briefing.js";
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import {
  systemRuntimeBackgroundTaskTimer,
  type RuntimeBackgroundTaskTimer,
} from "../background-task.js";

interface BriefingScheduleDependencies {
  readonly aggregator: DailyBriefingAggregatorPort;
  readonly clock: ClockPort;
  readonly delivery: NotificationDeliveryPort;
  readonly reportFailure: (error: unknown) => void;
  readonly shutdownSignal?: AbortSignal;
  readonly store: BriefingStore;
}

interface BriefingSchedulerDependencies extends BriefingScheduleDependencies {
  readonly intervalMs: number;
  readonly shutdownSignal: AbortSignal;
  readonly timer?: RuntimeBackgroundTaskTimer;
}

export async function runBriefingScheduler(
  dependencies: BriefingSchedulerDependencies,
): Promise<void> {
  while (!dependencies.shutdownSignal.aborted) {
    await processBriefingScheduleCycle(dependencies);
    if (dependencies.shutdownSignal.aborted) return;
    await (dependencies.timer ?? systemRuntimeBackgroundTaskTimer).wait(
      dependencies.intervalMs,
      dependencies.shutdownSignal,
    );
  }
}

export async function processBriefingScheduleCycle(
  dependencies: BriefingScheduleDependencies,
): Promise<void> {
  if (dependencies.shutdownSignal?.aborted) return;
  const preferences = await dependencies.store.getPreferences();
  const schedule = preferences.schedule;
  if (!schedule) return;
  const now = dependencies.clock.now();
  const local = zonedParts(now, schedule.timeZone);
  const localDate = formatDate(local);
  const weekday = weekdayAt(now, schedule.timeZone);
  if (!schedule.weekdays.includes(weekday)) return;
  const slotId = `briefing:${schedule.timeZone}:${localDate}:${schedule.localTime}:${schedule.weekdays.join(",")}`;
  const timing = resolveSlotTiming(schedule, preferences, local);
  if (timing.skip) {
    if (now >= timing.scheduledAt) {
      await dependencies.store.skipDeliverySlot({
        id: slotId,
        skippedAt: now.toISOString(),
      });
    }
    return;
  }
  if (
    now < timing.deliverAt ||
    !sameLocalDate(now, schedule.timeZone, localDate)
  )
    return;

  if (dependencies.shutdownSignal?.aborted) return;
  const claimed = await dependencies.store.claimDeliverySlot({
    claimedAt: now.toISOString(),
    id: slotId,
  });
  if (!claimed || dependencies.shutdownSignal?.aborted) return;

  try {
    const diagnostics: unknown[] = [];
    const result = await dependencies.aggregator.create(
      {
        length: preferences.length,
        sections: preferences.sections,
        sinceLast: false,
        timeZone: schedule.timeZone,
        topics: preferences.searchTopics,
      },
      {
        now,
        reportDiagnostic: (error) => diagnostics.push(error),
        ...(dependencies.shutdownSignal
          ? { signal: dependencies.shutdownSignal }
          : {}),
      },
    );
    for (const diagnostic of diagnostics)
      reportBestEffort(dependencies, diagnostic);
    await dependencies.delivery.deliver(
      {
        id: slotId,
        spokenText: { dateStyle: "contextual", timeZone: schedule.timeZone },
        text: result.text,
      },
      dependencies.shutdownSignal
        ? { shutdownSignal: dependencies.shutdownSignal }
        : {},
    );
    const completed = await dependencies.store.completeDeliverySlot({
      deliveredAt: dependencies.clock.now().toISOString(),
      id: slotId,
      snapshot: result.snapshot,
    });
    if (!completed) {
      reportBestEffort(
        dependencies,
        new Error(
          "Briefing delivery slot changed before completion was recorded.",
        ),
      );
    }
  } catch (error) {
    reportBestEffort(dependencies, error);
  }
}

function resolveSlotTiming(
  schedule: BriefingSchedule,
  preferences: BriefingPreferences,
  local: ReturnType<typeof zonedParts>,
): { deliverAt: Date; scheduledAt: Date; skip: boolean } {
  const [hour, minute] = parseTime(schedule.localTime);
  const scheduledAt = resolveLocalDateTime(
    { ...local, hour, millisecond: 0, minute, second: 0 },
    schedule.timeZone,
  );
  const quiet = preferences.quietHours;
  if (!quiet || !timeInside(schedule.localTime, quiet.start, quiet.end)) {
    return { deliverAt: scheduledAt, scheduledAt, skip: false };
  }
  const [endHour, endMinute] = parseTime(quiet.end);
  const wraps = quiet.start > quiet.end;
  if (wraps && schedule.localTime >= quiet.start) {
    return { deliverAt: scheduledAt, scheduledAt, skip: true };
  }
  return {
    deliverAt: resolveLocalDateTime(
      { ...local, hour: endHour, millisecond: 0, minute: endMinute, second: 0 },
      schedule.timeZone,
    ),
    scheduledAt,
    skip: false,
  };
}

function parseTime(value: string): [number, number] {
  return [Number(value.slice(0, 2)), Number(value.slice(3, 5))];
}

function timeInside(value: string, start: string, end: string): boolean {
  return start < end
    ? value >= start && value < end
    : value >= start || value < end;
}

function formatDate(parts: ReturnType<typeof zonedParts>): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function sameLocalDate(
  date: Date,
  timeZone: string,
  expected: string,
): boolean {
  return formatDate(zonedParts(date, timeZone)) === expected;
}

function weekdayAt(
  date: Date,
  timeZone: string,
): BriefingSchedule["weekdays"][number] {
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long" })
    .format(date)
    .toLocaleLowerCase() as BriefingSchedule["weekdays"][number];
}

function reportBestEffort(
  dependencies: Pick<BriefingScheduleDependencies, "reportFailure">,
  error: unknown,
): void {
  try {
    dependencies.reportFailure(error);
  } catch {
    // Diagnostic sinks cannot alter durable briefing progress.
  }
}
