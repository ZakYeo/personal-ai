import type { AlarmStore } from "../../ports/alarm-store.js";
import type { ClockPort } from "../../ports/assistant.js";

interface AlarmRetentionTimer {
  wait(delayMs: number, shutdownSignal: AbortSignal): Promise<void>;
}

interface AlarmRetentionDependencies {
  clock: ClockPort;
  intervalMs: number;
  retentionMs: number;
  shutdownSignal: AbortSignal;
  store: AlarmStore;
  timer?: AlarmRetentionTimer;
}

export async function runAlarmRetention(
  dependencies: AlarmRetentionDependencies,
): Promise<void> {
  while (!dependencies.shutdownSignal.aborted) {
    await removeExpiredAlarmHistory(dependencies);
    await (dependencies.timer ?? systemAlarmRetentionTimer).wait(
      dependencies.intervalMs,
      dependencies.shutdownSignal,
    );
  }
}

export function removeExpiredAlarmHistory(
  dependencies: Pick<
    AlarmRetentionDependencies,
    "clock" | "retentionMs" | "store"
  >,
): Promise<number> {
  const cutoff = new Date(
    dependencies.clock.now().getTime() - dependencies.retentionMs,
  ).toISOString();
  return dependencies.store.removeTerminalBefore(cutoff);
}

const systemAlarmRetentionTimer: AlarmRetentionTimer = {
  wait: (delayMs, shutdownSignal) =>
    new Promise((resolve) => {
      if (shutdownSignal.aborted) {
        resolve();
        return;
      }
      const finish = () => {
        clearTimeout(timeout);
        shutdownSignal.removeEventListener("abort", finish);
        resolve();
      };
      const timeout = setTimeout(finish, delayMs);
      shutdownSignal.addEventListener("abort", finish, { once: true });
    }),
};
