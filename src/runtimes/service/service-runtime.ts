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

export interface ServiceRuntimeOptions {
  config?: LoadedRuntimeConfig;
  configPath?: string;
  createAssistant?: () => Promise<Assistant>;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  io?: ServiceRuntimeIo;
  now?: () => Date;
  processSignals?: ServiceProcessSignals;
  runTurn(context: ServiceTurnContext): Promise<void>;
  shutdownHooks?: Array<(context: ServiceShutdownContext) => Promise<void>>;
}

type ServiceRuntimeResult =
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
  const unregisterSignals = registerShutdownSignals(
    options.processSignals,
    (reason, signal) => {
      state.requestShutdown(reason, signal);
    },
  );

  try {
    const assistant = await createServiceAssistant(options);
    let turnsCompleted = 0;

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
      } catch (error) {
        logRuntimeFailure(error, options.io ?? {});
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

    return {
      response: safeRuntimeFallbackResponse,
      status: "startup_failed",
      turnsCompleted: 0,
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

  return (["SIGINT", "SIGTERM"] satisfies ServiceSignal[]).map((signal) =>
    processSignals.onSignal(signal, () => {
      requestShutdown(`signal:${signal}`, signal);
    }),
  );
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
