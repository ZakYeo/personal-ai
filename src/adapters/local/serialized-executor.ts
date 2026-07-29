export type SerializedExecutor = <T>(operation: () => Promise<T>) => Promise<T>;

export function createSerializedExecutor(): SerializedExecutor {
  let pending: Promise<void> = Promise.resolve();

  return <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.then(operation);
    pending = result.then(
      () => {},
      () => {},
    );
    return result;
  };
}
