import type {
  RuntimeBackgroundTask,
  RuntimeBackgroundTaskContext,
} from "../background-task.js";
import { waitForCleanupWithinDeadline } from "../bounded-cleanup.js";

interface ServiceBackgroundTaskSupervisorOptions {
  context: RuntimeBackgroundTaskContext;
  reportFailure(error: unknown): void;
  requestShutdown(reason: string): void;
  runTask(
    task: RuntimeBackgroundTask,
    context: RuntimeBackgroundTaskContext,
  ): Promise<void>;
  tasks: readonly RuntimeBackgroundTask[];
}

export interface ServiceBackgroundTaskSupervisor {
  readonly failed: boolean;
  joinWithin(deadlineMs: number): Promise<Error | undefined>;
}

export function startServiceBackgroundTaskSupervisor(
  options: ServiceBackgroundTaskSupervisorOptions,
): ServiceBackgroundTaskSupervisor {
  let failed = false;
  const taskGroup = Promise.all(
    options.tasks.map(async (task) => {
      try {
        await options.runTask(task, options.context);

        if (!options.context.shutdownSignal.aborted) {
          failTask(
            task,
            new Error(`Background task "${task.id}" stopped unexpectedly.`),
          );
        }
      } catch (error) {
        if (options.context.shutdownSignal.aborted) {
          options.reportFailure(error);
          return;
        }

        failTask(task, error);
      }
    }),
  ).then(() => {});

  return {
    get failed() {
      return failed;
    },
    joinWithin: (deadlineMs) =>
      waitForCleanupWithinDeadline(
        taskGroup,
        deadlineMs,
        `Background tasks did not stop within ${deadlineMs}ms.`,
      ),
  };

  function failTask(task: RuntimeBackgroundTask, error: unknown): void {
    failed = true;
    options.reportFailure(error);
    options.requestShutdown(task.failureReason);
  }
}
