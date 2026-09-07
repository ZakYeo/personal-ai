/** Stops waiting on cancellation; the operation must also receive the signal. */
export function awaitAbortableOperation<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error("Operation cancelled.", { cause: signal.reason }),
      );
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    void operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
