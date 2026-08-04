import type { AlarmDeliveryPort } from "../../ports/alarm-delivery.js";
import type {
  AlarmRecord,
  AlarmStore,
  AlarmStatus,
} from "../../ports/alarm-store.js";
import type { ClockPort } from "../../ports/assistant.js";
import {
  systemRuntimeBackgroundTaskTimer,
  type RuntimeBackgroundTaskTimer,
} from "../background-task.js";

export interface AlarmSchedulerConfig {
  missedGraceMs: number;
  repeatAfterMs: number;
}

export interface AlarmDeliveryFailure {
  alarmId: string;
  error: unknown;
}

export interface AlarmSchedulerDependencies {
  clock: ClockPort;
  config: AlarmSchedulerConfig;
  delivery: AlarmDeliveryPort;
  reportDeliveryFailure(failure: AlarmDeliveryFailure): void;
  shutdownSignal?: AbortSignal;
  store: AlarmStore;
}

interface AlarmSchedulerRuntimeDependencies extends AlarmSchedulerDependencies {
  clockRecheckMs: number;
  shutdownSignal: AbortSignal;
  timer?: RuntimeBackgroundTaskTimer;
}

export async function runAlarmScheduler(
  dependencies: AlarmSchedulerRuntimeDependencies,
): Promise<void> {
  while (!dependencies.shutdownSignal.aborted) {
    const nextDeliveryAt = await processAlarmSchedulerCycle(dependencies);
    if (dependencies.shutdownSignal.aborted) {
      return;
    }

    const untilNextDelivery = nextDeliveryAt
      ? Math.max(
          0,
          new Date(nextDeliveryAt).getTime() -
            dependencies.clock.now().getTime(),
        )
      : dependencies.clockRecheckMs;
    await (dependencies.timer ?? systemRuntimeBackgroundTaskTimer).wait(
      Math.min(untilNextDelivery, dependencies.clockRecheckMs),
      dependencies.shutdownSignal,
    );
  }
}

export async function processAlarmSchedulerCycle(
  dependencies: AlarmSchedulerDependencies,
): Promise<string | undefined> {
  while (!dependencies.shutdownSignal?.aborted) {
    const alarms = await dependencies.store.list();
    const now = dependencies.clock.now();
    const interrupted = alarms.find(isInterruptedFinalClaim);

    if (interrupted) {
      await finalizeAlarm(dependencies.store, interrupted, now);
      continue;
    }

    const next = findNextActiveAlarm(alarms);
    if (!next) {
      return;
    }

    const nextAt = new Date(next.nextDeliveryAt);
    if (nextAt.getTime() > now.getTime()) {
      return next.nextDeliveryAt;
    }

    if (now.getTime() - nextAt.getTime() > dependencies.config.missedGraceMs) {
      await finalizeAlarm(dependencies.store, next, now);
      continue;
    }

    await claimAndDeliver(dependencies, next, now);
  }

  return;
}

function isInterruptedFinalClaim(alarm: AlarmRecord): boolean {
  return (
    alarm.status === "ringing" &&
    alarm.deliveryAttempts >= 2 &&
    alarm.nextDeliveryAt === undefined
  );
}

function findNextActiveAlarm(
  alarms: readonly AlarmRecord[],
): DeliverableAlarmRecord | undefined {
  return alarms
    .filter(
      (alarm) =>
        (alarm.status === "scheduled" ||
          alarm.status === "snoozed" ||
          alarm.status === "ringing") &&
        alarm.nextDeliveryAt !== undefined,
    )
    .filter(hasNextDeliveryAt)
    .sort((left, right) =>
      left.nextDeliveryAt.localeCompare(right.nextDeliveryAt),
    )[0];
}

type DeliverableAlarmRecord = AlarmRecord & { nextDeliveryAt: string };

function hasNextDeliveryAt(
  alarm: AlarmRecord,
): alarm is DeliverableAlarmRecord {
  return alarm.nextDeliveryAt !== undefined;
}

async function claimAndDeliver(
  dependencies: AlarmSchedulerDependencies,
  alarm: AlarmRecord,
  now: Date,
): Promise<void> {
  const attempt = alarm.deliveryAttempts + 1;
  const claimed = await dependencies.store.update({
    changes: {
      deliveryAttempts: attempt,
      nextDeliveryAt:
        attempt < 2
          ? new Date(
              now.getTime() + dependencies.config.repeatAfterMs,
            ).toISOString()
          : null,
      status: "ringing",
    },
    expectedRevision: alarm.revision,
    id: alarm.id,
    updatedAt: now.toISOString(),
  });

  if (!claimed) {
    return;
  }

  let delivered = false;
  let deliveryFailure: AlarmDeliveryFailure | undefined;
  try {
    await dependencies.delivery.deliver(
      {
        attempt,
        id: claimed.id,
        label: claimed.label,
        scheduledFor: claimed.scheduledFor,
      },
      dependencies.shutdownSignal
        ? { shutdownSignal: dependencies.shutdownSignal }
        : {},
    );
    delivered = true;
  } catch (error) {
    deliveryFailure = { alarmId: claimed.id, error };
  }

  const successfulDeliveries =
    claimed.successfulDeliveries + (delivered ? 1 : 0);
  const terminal = attempt >= 2;
  await persistDeliveryOutcome(
    dependencies,
    claimed,
    successfulDeliveries,
    terminal,
  );

  if (deliveryFailure) {
    reportDeliveryFailureBestEffort(dependencies, deliveryFailure);
  }
}

async function persistDeliveryOutcome(
  dependencies: AlarmSchedulerDependencies,
  claimed: AlarmRecord,
  successfulDeliveries: number,
  terminal: boolean,
): Promise<void> {
  const status = terminal ? terminalStatus(successfulDeliveries) : "ringing";
  let current = claimed;

  for (let revisionAttempt = 0; revisionAttempt < 3; revisionAttempt += 1) {
    const persisted = await dependencies.store.update({
      changes: {
        ...(terminal ? { nextDeliveryAt: null } : {}),
        status,
        successfulDeliveries,
      },
      expectedRevision: current.revision,
      id: claimed.id,
      updatedAt: dependencies.clock.now().toISOString(),
    });
    if (persisted) {
      return;
    }

    const latest = (await dependencies.store.list()).find(
      (alarm) => alarm.id === claimed.id,
    );
    if (!latest) {
      throw new Error("Claimed alarm disappeared before delivery completed.");
    }
    if (hasPersistedDeliveryOutcome(latest, successfulDeliveries, status)) {
      return;
    }
    if (!isCompatibleDeliveryClaim(latest, claimed)) {
      return;
    }
    current = latest;
  }

  throw new Error("Alarm delivery outcome could not be persisted.");
}

function hasPersistedDeliveryOutcome(
  alarm: AlarmRecord,
  successfulDeliveries: number,
  status: AlarmStatus,
): boolean {
  return (
    alarm.successfulDeliveries === successfulDeliveries &&
    alarm.status === status
  );
}

function isCompatibleDeliveryClaim(
  current: AlarmRecord,
  claimed: AlarmRecord,
): boolean {
  return (
    current.status === "ringing" &&
    current.deliveryAttempts === claimed.deliveryAttempts &&
    current.successfulDeliveries === claimed.successfulDeliveries &&
    current.nextDeliveryAt === claimed.nextDeliveryAt
  );
}

function reportDeliveryFailureBestEffort(
  dependencies: AlarmSchedulerDependencies,
  failure: AlarmDeliveryFailure,
): void {
  try {
    dependencies.reportDeliveryFailure(failure);
  } catch {
    // Diagnostic sinks cannot alter durable alarm lifecycle progress.
  }
}

async function finalizeAlarm(
  store: AlarmStore,
  alarm: AlarmRecord,
  now: Date,
): Promise<void> {
  await store.update({
    changes: {
      nextDeliveryAt: null,
      status: terminalStatus(alarm.successfulDeliveries),
    },
    expectedRevision: alarm.revision,
    id: alarm.id,
    updatedAt: now.toISOString(),
  });
}

function terminalStatus(successfulDeliveries: number): AlarmStatus {
  return successfulDeliveries > 0 ? "completed" : "missed";
}
