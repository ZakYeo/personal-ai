import { awaitAbortableOperation } from "../abortable-operation.js";
import { waitForCleanupWithinDeadline } from "../bounded-cleanup.js";

export interface VoiceTurnSession {
  readonly signal: AbortSignal;
  dispose(): void;
  run<T>(operation: () => Promise<T>): Promise<T>;
}

export interface VoiceTurnController {
  readonly failed: boolean;
  begin(shutdownSignal?: AbortSignal): VoiceTurnSession;
  cancel(): Promise<void>;
}

export function createVoiceTurnController(
  options: { onCleanupFailure?(error: Error): void } = {},
): VoiceTurnController {
  let active: { abort(): void; finished: Promise<void> } | undefined;
  let failure: Error | undefined;
  const fail = (error: Error) => {
    if (failure) return;
    failure = error;
    try {
      options.onCleanupFailure?.(error);
    } catch {
      /* Keep the failed ownership state even if reporting fails. */
    }
  };
  return {
    get failed() {
      return failure !== undefined;
    },
    async cancel() {
      const current = active;
      if (current) {
        current.abort();
        const error = await waitForCleanupWithinDeadline(
          current.finished,
          1600,
          "Voice turn cleanup did not finish within 1600ms.",
        );
        if (error) fail(error);
      }
      if (failure) throw failure;
    },
    begin(shutdownSignal) {
      if (failure) throw failure;
      if (active) throw new Error("A voice turn is already active.");
      const controller = new AbortController();
      const signal = shutdownSignal
        ? AbortSignal.any([controller.signal, shutdownSignal])
        : controller.signal;
      let finish = () => {};
      let disposed = false;
      let running = false;
      const current = {
        abort: () => controller.abort(new Error("Voice turn cancelled.")),
        finished: new Promise<void>((resolve) => {
          finish = resolve;
        }),
      };
      active = current;
      return {
        signal,
        dispose() {
          if (disposed) return;
          disposed = true;
          if (running)
            fail(
              new Error(
                "Voice turn released before operation cleanup completed.",
              ),
            );
          current.abort();
          if (active === current) active = undefined;
          finish();
        },
        async run<T>(operation: () => Promise<T>): Promise<T> {
          if (disposed) throw new Error("Voice turn has ended.");
          if (running) throw new Error("A voice operation is already active.");
          signal.throwIfAborted();
          running = true;
          try {
            const work = operation();
            try {
              return await awaitAbortableOperation(work, signal);
            } finally {
              if (signal.aborted) {
                const error = await waitForCleanupWithinDeadline(
                  work.then(
                    () => {},
                    () => {},
                  ),
                  1500,
                  "Voice operation cleanup did not finish within 1500ms.",
                );
                if (error) fail(error);
              }
            }
          } finally {
            running = false;
          }
        },
      };
    },
  };
}
