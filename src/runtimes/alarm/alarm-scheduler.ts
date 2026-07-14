import type { AlarmDeliveryPort } from "../../ports/alarm-delivery.js";
import type {
  AlarmLifecycleStore,
  AlarmRecord,
  AlarmStatus,
} from "../../ports/alarm-store.js";
import type { ClockPort } from "../../ports/assistant.js";

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
  store: AlarmLifecycleStore;
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
    if (!next?.nextDeliveryAt) {
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
): AlarmRecord | undefined {
  return alarms
    .filter(
      (alarm) =>
        (alarm.status === "scheduled" || alarm.status === "ringing") &&
        alarm.nextDeliveryAt !== undefined,
    )
    .sort((left, right) =>
      left.nextDeliveryAt!.localeCompare(right.nextDeliveryAt!),
    )[0];
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
    dependencies.reportDeliveryFailure({ alarmId: claimed.id, error });
  }

  const successfulDeliveries =
    claimed.successfulDeliveries + (delivered ? 1 : 0);
  const terminal = attempt >= 2;
  await dependencies.store.update({
    changes: {
      ...(terminal ? { nextDeliveryAt: null } : {}),
      status: terminal ? terminalStatus(successfulDeliveries) : "ringing",
      successfulDeliveries,
    },
    expectedRevision: claimed.revision,
    id: claimed.id,
    updatedAt: dependencies.clock.now().toISOString(),
  });
}

async function finalizeAlarm(
  store: AlarmLifecycleStore,
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
