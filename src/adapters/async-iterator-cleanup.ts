interface AsyncIteratorCleanupOptions {
  label: string;
  timeoutMs: number;
}

export function cleanupAsyncIteratorWithinDeadline<T>(
  iterator: AsyncIterator<T>,
  options: AsyncIteratorCleanupOptions,
): Promise<Error | undefined> {
  if (!iterator.return) return Promise.resolve(undefined);

  let cleanup: Promise<IteratorResult<T>>;
  try {
    cleanup = Promise.resolve(iterator.return());
  } catch (error) {
    return Promise.resolve(toError(error));
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(
        new Error(
          `${options.label} iterator cleanup timed out after ${options.timeoutMs}ms.`,
        ),
      );
    }, options.timeoutMs);

    void cleanup.then(
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
      (error: unknown) => {
        clearTimeout(timer);
        resolve(toError(error));
      },
    );
  });
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
