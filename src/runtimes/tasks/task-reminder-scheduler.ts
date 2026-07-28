import type { ClockPort } from "../../ports/assistant.js";
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import type { TaskRecord, TaskStore } from "../../ports/task-store.js";
import {
  systemRuntimeBackgroundTaskTimer,
  type RuntimeBackgroundTaskTimer,
} from "../background-task.js";

interface TaskReminderSchedulerDependencies {
  clock: ClockPort;
  delivery: NotificationDeliveryPort;
  reportFailure(error: unknown): void;
  shutdownSignal?: AbortSignal;
  store: TaskStore;
}

interface TaskReminderSchedulerRuntimeDependencies extends TaskReminderSchedulerDependencies {
  clockRecheckMs: number;
  shutdownSignal: AbortSignal;
  timer?: RuntimeBackgroundTaskTimer;
}

export async function runTaskReminderScheduler(
  dependencies: TaskReminderSchedulerRuntimeDependencies,
): Promise<void> {
  if (dependencies.shutdownSignal.aborted) return;
  await reportInterruptedClaims(dependencies);
  while (!dependencies.shutdownSignal.aborted) {
    const nextReminderAt = await processTaskReminderCycle(dependencies);
    if (dependencies.shutdownSignal.aborted) return;
    const untilNextReminder = nextReminderAt
      ? Math.max(
          0,
          new Date(nextReminderAt).getTime() -
            dependencies.clock.now().getTime(),
        )
      : dependencies.clockRecheckMs;
    await (dependencies.timer ?? systemRuntimeBackgroundTaskTimer).wait(
      Math.min(untilNextReminder, dependencies.clockRecheckMs),
      dependencies.shutdownSignal,
    );
  }
}

export async function processTaskReminderCycle(
  dependencies: TaskReminderSchedulerDependencies,
): Promise<string | undefined> {
  while (!dependencies.shutdownSignal?.aborted) {
    const tasks = await dependencies.store.listTasks();
    const next = findNextScheduledReminder(tasks);
    if (!next?.reminder || next.reminder.status !== "scheduled") return;
    const now = dependencies.clock.now();
    if (next.reminder.scheduledFor > now.toISOString()) {
      return next.reminder.scheduledFor;
    }
    const claimed = await dependencies.store.claimReminder({
      claimedAt: now.toISOString(),
      expectedRevision: next.revision,
      id: next.id,
    });
    if (!claimed) continue;
    await deliverClaimedReminder(dependencies, claimed);
  }
  return;
}

function findNextScheduledReminder(
  tasks: readonly TaskRecord[],
): TaskRecord | undefined {
  return tasks
    .filter((task) => task.reminder?.status === "scheduled")
    .sort((left, right) =>
      left.reminder!.scheduledFor.localeCompare(right.reminder!.scheduledFor),
    )[0];
}

async function deliverClaimedReminder(
  dependencies: TaskReminderSchedulerDependencies,
  task: TaskRecord,
): Promise<void> {
  if (task.reminder?.status !== "claimed") return;
  try {
    await dependencies.delivery.deliver(
      {
        id: `task-reminder:${task.id}`,
        text: `Reminder: ${task.label}.`,
      },
      dependencies.shutdownSignal
        ? { shutdownSignal: dependencies.shutdownSignal }
        : {},
    );
  } catch (error) {
    reportFailureBestEffort(dependencies, error);
    return;
  }

  const delivered = await dependencies.store.markReminderDelivered({
    deliveredAt: dependencies.clock.now().toISOString(),
    expectedRevision: task.revision,
    id: task.id,
  });
  if (!delivered) {
    reportFailureBestEffort(
      dependencies,
      new Error(
        `Task reminder ${task.id} changed before delivery could be recorded.`,
      ),
    );
  }
}

async function reportInterruptedClaims(
  dependencies: TaskReminderSchedulerDependencies,
): Promise<void> {
  const tasks = await dependencies.store.listTasks();
  for (const task of tasks) {
    if (task.reminder?.status === "claimed") {
      reportFailureBestEffort(
        dependencies,
        new Error(
          `Task reminder ${task.id} has an interrupted delivery claim.`,
        ),
      );
    }
  }
}

function reportFailureBestEffort(
  dependencies: TaskReminderSchedulerDependencies,
  error: unknown,
): void {
  try {
    dependencies.reportFailure(error);
  } catch {
    // Diagnostic sinks cannot change durable task reminder progress.
  }
}
