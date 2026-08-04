export function waitForCleanupWithinDeadline(
  cleanup: Promise<unknown>,
  deadlineMs: number,
  timeoutMessage: string,
): Promise<Error | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(new Error(timeoutMessage));
    }, deadlineMs);

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
