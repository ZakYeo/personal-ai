import { awaitAbortableOperation } from "../abortable-operation.js";
import { waitForCleanupWithinDeadline } from "../bounded-cleanup.js";

export class VoiceOutputCancelledError extends Error {
  constructor(cause?: unknown) {
    super("Voice output was cancelled.", { cause });
  }
}

export interface VoiceOutputCoordinator {
  interrupt(): Promise<void>;
  run<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    options?: { signal?: AbortSignal },
  ): Promise<T>;
}

export function createVoiceOutputCoordinator(
  options: {
    onCleanupFailure?(error: Error): void;
  } = {},
): VoiceOutputCoordinator {
  let pending: Promise<void> = Promise.resolve();
  let cleanupFailure: Error | undefined;
  const admitted = new Set<AbortController>();

  return {
    async interrupt() {
      for (const controller of admitted)
        controller.abort(new VoiceOutputCancelledError());
      await pending;
      if (cleanupFailure) throw cleanupFailure;
    },
    run<T>(
      operation: (signal: AbortSignal) => Promise<T>,
      request: { signal?: AbortSignal } = {},
    ): Promise<T> {
      if (cleanupFailure) return Promise.reject(cleanupFailure);
      if (admitted.size >= 32)
        return Promise.reject(new Error("Voice output queue is full."));
      const controller = new AbortController();
      admitted.add(controller);
      const signal = request.signal
        ? AbortSignal.any([controller.signal, request.signal])
        : controller.signal;
      const result = pending.then(async () => {
        try {
          if (cleanupFailure) throw cleanupFailure;
          signal.throwIfAborted();
          const work = operation(signal);
          try {
            return await awaitAbortableOperation(work, signal);
          } finally {
            if (signal.aborted) {
              cleanupFailure = await waitForCleanupWithinDeadline(
                work.then(
                  () => {},
                  () => {},
                ),
                1000,
                "Voice output cleanup did not finish within 1000ms.",
              );
              if (cleanupFailure) {
                try {
                  options.onCleanupFailure?.(cleanupFailure);
                } catch {
                  /* Reporting cannot release quarantined output. */
                }
              }
            }
          }
        } finally {
          admitted.delete(controller);
        }
      });
      pending = result.then(
        () => {},
        () => {},
      );
      return result.catch((error: unknown) => {
        if (signal.aborted)
          throw new VoiceOutputCancelledError(signal.reason as unknown);
        throw error;
      });
    },
  };
}
