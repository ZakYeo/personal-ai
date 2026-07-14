import type { ClockPort } from "../ports/assistant.js";

export interface RuntimeBackgroundTaskContext {
  clock: ClockPort;
  reportFailure(error: unknown): void;
  shutdownSignal: AbortSignal;
  timer?: RuntimeBackgroundTaskTimer;
}

export interface RuntimeBackgroundTaskTimer {
  wait(delayMs: number, shutdownSignal: AbortSignal): Promise<void>;
}

export interface RuntimeBackgroundTask {
  failureReason: string;
  id: string;
  run(context: RuntimeBackgroundTaskContext): Promise<void>;
}
