import type { ClockPort } from "../../ports/assistant.js";
import type { TaskStore } from "../../ports/task-store.js";
import {
  systemRuntimeBackgroundTaskTimer,
  type RuntimeBackgroundTaskTimer,
} from "../background-task.js";

interface TaskReminderRetentionDependencies {
  clock: ClockPort;
  intervalMs: number;
  retentionMs: number;
  shutdownSignal: AbortSignal;
  store: TaskStore;
  timer?: RuntimeBackgroundTaskTimer;
}

export async function runTaskReminderRetention(
  dependencies: TaskReminderRetentionDependencies,
): Promise<void> {
  while (!dependencies.shutdownSignal.aborted) {
    await clearExpiredTaskReminderHistory(dependencies);
    await (dependencies.timer ?? systemRuntimeBackgroundTaskTimer).wait(
      dependencies.intervalMs,
      dependencies.shutdownSignal,
    );
  }
}

export function clearExpiredTaskReminderHistory(
  dependencies: Pick<
    TaskReminderRetentionDependencies,
    "clock" | "retentionMs" | "store"
  >,
): Promise<number> {
  const now = dependencies.clock.now();
  const cutoff = new Date(
    now.getTime() - dependencies.retentionMs,
  ).toISOString();
  return dependencies.store.clearTerminalRemindersBefore({
    cutoff,
    updatedAt: now.toISOString(),
  });
}
