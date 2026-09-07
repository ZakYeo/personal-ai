import { waitForCleanupWithinDeadline } from "../bounded-cleanup.js";

/** Owns one read at a time; timed-out reads cannot publish or accumulate retries. */
export function createPresentationRefresh<T>(options: {
  read(): Promise<T>;
  publish(value: T): void;
  reportFailure(error: unknown): void;
}): { request(): Promise<void>; stop(): void } {
  let stopped = false;
  let running = false;
  let pending = Promise.resolve();
  return {
    request() {
      if (stopped || running) return pending;
      running = true;
      let expired = false;
      const read = Promise.resolve()
        .then(() => options.read())
        .then((value) => {
          if (!stopped && !expired) options.publish(value);
        })
        .finally(() => {
          running = false;
        });
      pending = waitForCleanupWithinDeadline(
        read,
        5_000,
        "Presentation refresh did not complete within 5000ms.",
      ).then((error) => {
        if (error) {
          expired = true;
          options.reportFailure(error);
        }
      });
      return pending;
    },
    stop() {
      stopped = true;
    },
  };
}
