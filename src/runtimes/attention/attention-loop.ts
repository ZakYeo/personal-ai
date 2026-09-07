import { processAttentionCycle } from "../../application/attention-engine.js";
import { pruneAttentionHistory } from "../../application/attention-commands.js";
import type {
  AttentionSourceReaderPort,
  AttentionStore,
} from "../../ports/attention.js";
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import {
  systemRuntimeBackgroundTaskTimer,
  type RuntimeBackgroundTaskContext,
} from "../background-task.js";

export async function runAttentionLoop(
  options: {
    store: AttentionStore;
    reader: AttentionSourceReaderPort;
    delivery?: NotificationDeliveryPort;
  },
  context: RuntimeBackgroundTaskContext,
): Promise<void> {
  let retainedAt: number | undefined;
  while (!context.shutdownSignal.aborted) {
    const now = context.clock.now();
    if (retainedAt === undefined || now.getTime() - retainedAt >= 86_400_000) {
      await pruneAttentionHistory(options.store, now);
      retainedAt = now.getTime();
    }
    await processAttentionCycle({
      ...options,
      clock: context.clock,
      signal: context.shutdownSignal,
      reportFailure: (error) => context.reportFailure(error),
    });
    if (context.shutdownSignal.aborted) return;
    await (context.timer ?? systemRuntimeBackgroundTaskTimer).wait(
      60_000,
      context.shutdownSignal,
    );
  }
}
