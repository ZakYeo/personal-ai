export interface VoiceOutputCoordinator {
  run<T>(operation: () => Promise<T>): Promise<T>;
}

export function createVoiceOutputCoordinator(): VoiceOutputCoordinator {
  let pending: Promise<void> = Promise.resolve();

  return {
    run: <T>(operation: () => Promise<T>) => {
      const result = pending.then(operation);
      pending = result.then(
        () => {},
        () => {},
      );
      return result;
    },
  };
}
