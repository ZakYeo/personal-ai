import type { Assistant } from "../../core/assistant/index.js";
import type { AssistantResponse } from "../../ports/assistant.js";
import {
  logRuntimeFailure,
  safeRuntimeFallbackResponse,
} from "../human-boundary.js";

export type ServiceSignal = "SIGINT" | "SIGTERM";

export interface ServiceRuntimeIo {
  stderr?: { write(chunk: string): boolean | void };
}

export interface ServiceProcessSignals {
  onSignal(signal: ServiceSignal, handler: () => void): () => void;
}

export interface ServiceShutdownContext {
  reason?: string;
  signal?: ServiceSignal;
}

export interface ServiceTurnContext {
  assistant: Assistant;
  configPath?: string;
  now(): Date;
  requestShutdown(reason?: string): void;
  shutdownSignal: AbortSignal;
}

export interface ServiceTurnFailureContext {
  error: unknown;
  failures: number;
  now(): Date;
  requestShutdown(reason?: string): void;
}

export interface ServiceRuntimeOptions {
  configPath?: string;
  createAssistant: () => Promise<Assistant>;
  io?: ServiceRuntimeIo;
  now?: () => Date;
  processSignals?: ServiceProcessSignals;
  retryAfterFailure?: (context: ServiceTurnFailureContext) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  runTurn(context: ServiceTurnContext): Promise<void>;
  shutdownHooks?: Array<(context: ServiceShutdownContext) => Promise<void>>;
}

export type ServiceRuntimeResult =
  | {
      status: "failed";
      response: AssistantResponse;
      turnsCompleted: number;
    }
  | {
      status: "startup_failed";
      response: AssistantResponse;
      turnsCompleted: 0;
    }
  | {
      status: "stopped";
      turnsCompleted: number;
    };

export async function runServiceRuntime(
  options: ServiceRuntimeOptions,
): Promise<ServiceRuntimeResult> {
  const state = createServiceState();
  let unregisterSignals: Array<() => void> = [];
  let started = false;
  let turnsCompleted = 0;

  try {
    unregisterSignals = registerShutdownSignals(
      options.processSignals,
      (reason, signal) => {
        state.requestShutdown(reason, signal);
      },
      options.io ?? {},
    );

    const assistant = await options.createAssistant();
    started = true;
    let turnFailures = 0;

    while (!state.shutdownRequested) {
      try {
        await options.runTurn({
          assistant,
          ...(options.configPath ? { configPath: options.configPath } : {}),
          now: options.now ?? (() => new Date()),
          requestShutdown: (reason) => {
            state.requestShutdown(reason);
          },
          shutdownSignal: state.shutdownSignal,
        });
        turnsCompleted += 1;
        turnFailures = 0;
      } catch (error) {
        if (state.shutdownRequested) {
          break;
        }

        turnFailures += 1;
        logRuntimeFailure(error, options.io ?? {});
        await retryAfterTurnFailure(options, {
          error,
          failures: turnFailures,
          now: options.now ?? (() => new Date()),
          requestShutdown: (reason) => {
            state.requestShutdown(reason);
          },
        });
      }
    }

    return {
      status: "stopped",
      turnsCompleted,
    };
  } catch (error) {
    logRuntimeFailure(error, options.io ?? {});

    if (!started) {
      return {
        response: safeRuntimeFallbackResponse,
        status: "startup_failed",
        turnsCompleted: 0,
      };
    }

    return {
      response: safeRuntimeFallbackResponse,
      status: "failed",
      turnsCompleted,
    };
  } finally {
    if (started) {
      await runShutdownHooks(
        options.shutdownHooks ?? [],
        state.shutdownContext,
        options.io ? { io: options.io } : {},
      );
    }

    unregisterSignalsBestEffort(unregisterSignals, options.io ?? {});
  }
}

function createServiceState() {
  const shutdownController = new AbortController();
  let shutdownContext: ServiceShutdownContext = {};
  let shutdownRequested = false;

  return {
    get shutdownContext() {
      return shutdownContext;
    },
    get shutdownRequested() {
      return shutdownRequested;
    },
    get shutdownSignal() {
      return shutdownController.signal;
    },
    requestShutdown(reason?: string, signal?: ServiceSignal) {
      if (shutdownRequested) {
        return;
      }

      shutdownRequested = true;
      shutdownContext = {
        ...(reason ? { reason } : {}),
        ...(signal ? { signal } : {}),
      };
      shutdownController.abort(
        new Error(reason ?? "Service shutdown requested."),
      );
    },
  };
}

function registerShutdownSignals(
  processSignals: ServiceProcessSignals | undefined,
  requestShutdown: (reason?: string, signal?: ServiceSignal) => void,
  io: ServiceRuntimeIo,
): Array<() => void> {
  if (!processSignals) {
    return [];
  }

  const unregisterSignals: Array<() => void> = [];

  try {
    for (const signal of ["SIGINT", "SIGTERM"] satisfies ServiceSignal[]) {
      unregisterSignals.push(
        processSignals.onSignal(signal, () => {
          requestShutdown(`signal:${signal}`, signal);
        }),
      );
    }
  } catch (error) {
    unregisterSignalsBestEffort(unregisterSignals, io);

    throw error;
  }

  return unregisterSignals;
}

function unregisterSignalsBestEffort(
  unregisterSignals: Array<() => void>,
  io: ServiceRuntimeIo,
): void {
  for (const unregister of unregisterSignals) {
    try {
      unregister();
    } catch (error) {
      logRuntimeFailure(error, io);
    }
  }
}

async function retryAfterTurnFailure(
  options: ServiceRuntimeOptions,
  context: ServiceTurnFailureContext,
): Promise<void> {
  const retryAfterFailure =
    options.retryAfterFailure ??
    createFixedDelayRetryAfterFailure({
      delayMs: 1000,
      sleep: options.sleep ?? sleepWithTimeout,
    });

  await retryAfterFailure(context);
}

function createFixedDelayRetryAfterFailure(options: {
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
}): (context: ServiceTurnFailureContext) => Promise<void> {
  return () => options.sleep(options.delayMs);
}

function sleepWithTimeout(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runShutdownHooks(
  shutdownHooks: Array<(context: ServiceShutdownContext) => Promise<void>>,
  context: ServiceShutdownContext,
  options: { io?: ServiceRuntimeIo },
): Promise<void> {
  for (const shutdownHook of shutdownHooks) {
    try {
      await shutdownHook(context);
    } catch (error) {
      logRuntimeFailure(error, options.io ?? {});
    }
  }
}
