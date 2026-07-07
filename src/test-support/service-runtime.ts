import type { Assistant } from "../core/assistant/index.js";
import type {
  ServiceProcessSignals,
  ServiceRuntimeOptions,
  ServiceSignal,
  ServiceTurnContext,
} from "../runtimes/service/service-runtime.js";
import { deterministicScenarios } from "./deterministic-scenarios.js";
import { createCapturedWriter } from "./primitives.js";

type ServiceRuntimeHarnessOptions = Partial<ServiceRuntimeOptions>;

export function createServiceRuntimeHarness(
  options: ServiceRuntimeHarnessOptions = {},
) {
  const stderr = createCapturedWriter();
  const runTurn = options.runTurn ?? createStoppingTurn();

  return {
    run: async () => {
      const { runServiceRuntime } =
        await import("../runtimes/service/service-runtime.js");

      return runServiceRuntime({
        ...(options.configPath ? { configPath: options.configPath } : {}),
        createAssistant: options.createAssistant ?? createServiceAssistant,
        io: options.io ?? { stderr },
        now: options.now ?? (() => new Date("2026-06-26T09:00:00.000Z")),
        ...(options.processSignals
          ? { processSignals: options.processSignals }
          : {}),
        retryAfterFailure:
          options.retryAfterFailure ??
          (() => {
            return Promise.resolve();
          }),
        runTurn,
        ...(options.shutdownHooks
          ? { shutdownHooks: options.shutdownHooks }
          : {}),
      });
    },
    runTurn,
    stderr,
  };
}

export function createServiceSignalController(): ServiceProcessSignals & {
  emit(signal: ServiceSignal): void;
  listenerCount(signal: ServiceSignal): number;
} {
  const listeners = new Map<ServiceSignal, Set<() => void>>();

  return {
    emit(signal) {
      for (const listener of listeners.get(signal) ?? []) {
        listener();
      }
    },
    listenerCount(signal) {
      return listeners.get(signal)?.size ?? 0;
    },
    onSignal(signal, handler) {
      const signalListeners = listeners.get(signal) ?? new Set<() => void>();
      signalListeners.add(handler);
      listeners.set(signal, signalListeners);

      return () => {
        signalListeners.delete(handler);
      };
    },
  };
}

function createServiceAssistant(): Promise<Assistant> {
  return Promise.resolve({
    handleText: () =>
      Promise.resolve(deterministicScenarios.alarmListEmpty.response),
    handleTextWithDiagnostics: () =>
      Promise.resolve({
        response: deterministicScenarios.alarmListEmpty.response,
      }),
  });
}

function createStoppingTurn() {
  return (context: ServiceTurnContext): Promise<void> => {
    context.requestShutdown("test complete");
    return Promise.resolve();
  };
}
