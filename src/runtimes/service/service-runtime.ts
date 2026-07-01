import type { Assistant } from "../../core/assistant/index.js";
import type { AssistantResponse } from "../../ports/assistant.js";
import { createConfiguredTextRuntime } from "../configured-text-runtime.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
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
}

export interface ServiceTurnFailureContext {
  error: unknown;
  failures: number;
  now(): Date;
  requestShutdown(reason?: string): void;
}

export interface ServiceRuntimeOptions {
  config?: LoadedRuntimeConfig;
  configPath?: string;
  createAssistant?: () => Promise<Assistant>;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  io?: ServiceRuntimeIo;
  now?: () => Date;
  processSignals?: ServiceProcessSignals;
  retryAfterFailure?: (context: ServiceTurnFailureContext) => Promise<void>;
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
    );

    const assistant = await createServiceAssistant(options);
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
        });
        turnsCompleted += 1;
        turnFailures = 0;
      } catch (error) {
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

    await runShutdownHooks(
      options.shutdownHooks ?? [],
      state.shutdownContext,
      options.io ? { io: options.io } : {},
    );

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
    for (const unregister of unregisterSignals) {
      unregister();
    }
  }
}

function createServiceAssistant(
  options: ServiceRuntimeOptions,
): Promise<Assistant> {
  if (options.createAssistant) {
    return options.createAssistant();
  }

  return createConfiguredTextRuntime({
    ...(options.config ? { config: options.config } : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
    ...(options.env ? { env: options.env } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.now ? { now: options.now() } : {}),
  });
}

function createServiceState() {
  let shutdownContext: ServiceShutdownContext = {};
  let shutdownRequested = false;

  return {
    get shutdownContext() {
      return shutdownContext;
    },
    get shutdownRequested() {
      return shutdownRequested;
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
    },
  };
}

function registerShutdownSignals(
  processSignals: ServiceProcessSignals | undefined,
  requestShutdown: (reason?: string, signal?: ServiceSignal) => void,
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
    for (const unregister of unregisterSignals) {
      unregister();
    }

    throw error;
  }

  return unregisterSignals;
}

async function retryAfterTurnFailure(
  options: ServiceRuntimeOptions,
  context: ServiceTurnFailureContext,
): Promise<void> {
  if (options.retryAfterFailure) {
    await options.retryAfterFailure(context);
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, 1000);
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
