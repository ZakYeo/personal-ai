import { createVoiceInterruption } from "./voice-interruption.js";
import { createVoiceTurnController } from "./voice-turn-controller.js";
import { createServiceFailureBoundary } from "../service/service-failure-boundary.js";
import type { ConfiguredTextRuntimeOptions } from "../configured-text-runtime.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
import { createNodeProcessControl } from "../process-control.js";
import { requireVoiceConfig } from "../config/voice-config.js";
import { runConfiguredServiceRuntime } from "../service/configured-service-composition.js";
import type {
  ServiceProcessSignals,
  ServiceRuntimeResult,
  ServiceShutdownContext,
  ServiceTurnFailureContext,
} from "../service/service-runtime.js";
import { cleanupVoiceAdapters } from "./voice-cleanup.js";
import {
  createDesktopVoiceOutputAdapters,
  createDesktopVoiceServiceAdapters,
  resolveDesktopVoiceServiceAdapterConfig,
  type DesktopVoiceAdapterRuntimeDependencies,
  type DesktopVoiceOutputAdapters,
  type DesktopVoiceServiceAdapters,
} from "./desktop-voice-adapter-registry.js";
import type { ProcessControl } from "../../ports/process-control.js";
import type { DesktopVoiceProviderAdapterRegistry } from "./desktop-voice-provider-adapter-registry.js";
import { validateConfiguredFeatureAdapters } from "../feature-adapter-selection.js";
import {
  runVoiceActivation,
  type VoiceActivationDependencies,
  type VoiceActivationResult,
} from "./voice-activation.js";
import type { VoiceRuntimeIo } from "./voice-turn.js";
import { validateOpenWakeWordStartup } from "./openwakeword-startup-check.js";
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import { createVoiceAlarmDelivery } from "./voice-alarm-delivery.js";
import { createVoiceOutputCoordinator } from "./voice-output-coordinator.js";
import type {
  RuntimeBackgroundTask,
  RuntimeBackgroundTaskContext,
} from "../background-task.js";
import { createDesktopPresentationRuntime } from "../presentation/desktop-presentation-runtime.js";
import { logRuntimeFailure } from "../human-boundary.js";
import type { VoiceInterruptionRequest } from "./voice-interruption-monitor.js";
import type { VoiceTimingOptions } from "./voice-timings.js";

export interface ConfiguredVoiceServiceRuntimeOptions extends Pick<
  ConfiguredTextRuntimeOptions,
  "configDirectory" | "env" | "featureAdapterRegistry" | "fetch" | "now"
> {
  config?: LoadedRuntimeConfig;
  backgroundTaskTimer?: RuntimeBackgroundTaskContext["timer"];
  notificationDelivery?: NotificationDeliveryPort;
  configPath?: string;
  createVoiceAdapters?: (
    voiceConfig: ReturnType<typeof requireVoiceConfig>,
    desktopVoiceConfig: ReturnType<
      typeof resolveDesktopVoiceServiceAdapterConfig
    >,
    dependencies: DesktopVoiceAdapterRuntimeDependencies,
  ) => DesktopVoiceServiceAdapters;
  createVoiceOutputAdapters?: (
    voiceConfig: ReturnType<typeof requireVoiceConfig>,
    desktopVoiceConfig: ReturnType<
      typeof resolveDesktopVoiceServiceAdapterConfig
    >,
    dependencies: DesktopVoiceAdapterRuntimeDependencies,
  ) => DesktopVoiceOutputAdapters;
  io?: VoiceRuntimeIo;
  timing?: VoiceTimingOptions;
  processControl?: ProcessControl;
  processSignals?: ServiceProcessSignals;
  retryAfterFailure?: (context: ServiceTurnFailureContext) => Promise<void>;
  runBackgroundTask?: (
    task: RuntimeBackgroundTask,
    context: RuntimeBackgroundTaskContext,
  ) => Promise<void>;
  runVoiceActivation?: (
    dependencies: VoiceActivationDependencies,
    io?: VoiceRuntimeIo,
  ) => Promise<VoiceActivationResult>;
  shutdownHooks?: Array<(context: ServiceShutdownContext) => Promise<void>>;
  desktopVoiceProviderAdapterRegistry?: DesktopVoiceProviderAdapterRegistry;
  desktopPresentation?: boolean;
}

export function runConfiguredVoiceServiceRuntime(
  options: ConfiguredVoiceServiceRuntimeOptions = {},
): Promise<ServiceRuntimeResult> {
  const env = options.env ?? process.env;
  const fetch = options.fetch ?? globalThis.fetch;
  const processControl =
    options.processControl ?? createNodeProcessControl(process);
  const failures = createServiceFailureBoundary({
    failureReason: "voice runtime cleanup failed",
    reportFailure: (error) => logRuntimeFailure(error, options.io ?? {}),
  });
  const turnController = createVoiceTurnController({
    onCleanupFailure: (error) => failures.report(error),
  });
  const outputCoordinator = createVoiceOutputCoordinator({
    onCleanupFailure: (error) => failures.report(error),
  });
  const presentationRuntime = options.desktopPresentation
    ? createDesktopPresentationRuntime({
        env,
        interruptTurn: () => turnController.cancel(),
        interruptVoice: createVoiceInterruption(
          turnController,
          outputCoordinator,
        ),
        ...(options.io ? { io: options.io } : {}),
        now: options.now ?? (() => new Date()),
      })
    : undefined;
  const voiceIo: VoiceRuntimeIo = {
    ...options.io,
    ...(presentationRuntime?.presentation
      ? { presentation: presentationRuntime.presentation }
      : {}),
  };
  let pendingCommand: VoiceInterruptionRequest | undefined;

  return runConfiguredServiceRuntime(
    {
      ...options,
      shutdownHooks: [
        ...(presentationRuntime ? [() => presentationRuntime.stop()] : []),
        ...(options.shutdownHooks ?? []),
      ],
      createNotificationDelivery: ({ config }) => {
        if (options.notificationDelivery) {
          return options.notificationDelivery;
        }

        const voiceConfig = requireVoiceConfig(config);
        const desktopVoiceConfig = resolveDesktopVoiceServiceAdapterConfig(
          voiceConfig,
          config,
        );
        return createVoiceAlarmDelivery(
          (deliverySignal) =>
            (
              options.createVoiceOutputAdapters ??
              createDesktopVoiceOutputAdapters
            )(voiceConfig, desktopVoiceConfig, {
              env,
              fetch,
              processControl,
              ...(deliverySignal ? { shutdownSignal: deliverySignal } : {}),
            }),
          options.io,
          outputCoordinator,
        );
      },
    },
    {
      validateConfig: (config) => validateVoiceServiceConfig(config, env),
      runTurn: async (context) => {
        const { assistant, config, services, shutdownSignal } = context;
        failures.bindShutdown((reason) => context.requestShutdown(reason));
        if (shutdownSignal.aborted) return;
        if (presentationRuntime) {
          await presentationRuntime
            .start(assistant, { config, services })
            .catch((error) => {
              logRuntimeFailure(error, voiceIo);
            });
        }
        const voiceConfig = requireVoiceConfig(config);
        const desktopVoiceConfig = resolveDesktopVoiceServiceAdapterConfig(
          voiceConfig,
          config,
        );
        const adapters = (
          options.createVoiceAdapters ?? createDesktopVoiceServiceAdapters
        )(voiceConfig, desktopVoiceConfig, {
          env,
          fetch,
          processControl,
          shutdownSignal,
        });

        try {
          const initialCommand = pendingCommand;
          pendingCommand = undefined;
          const result = await (
            options.runVoiceActivation ?? runVoiceActivation
          )(
            {
              assistant,
              audioOutput: adapters.audioOutput,
              commandAudioInput: adapters.audioInput,
              outputCoordinator,
              turnController,
              ...(options.timing ? { timing: options.timing } : {}),
              ...(voiceConfig.bargeIn ? { bargeIn: voiceConfig.bargeIn } : {}),
              ...(initialCommand ? { initialCommand } : {}),
              speechToText: adapters.speechToText,
              ...(adapters.streamingInput
                ? { streamingInput: adapters.streamingInput }
                : {}),
              ...(adapters.streamingOutput
                ? { streamingOutput: adapters.streamingOutput }
                : {}),
              shutdownSignal,
              textToSpeech: adapters.textToSpeech,
              turnConfig: {
                wakePhrases: config.assistant.wakePhrases,
              },
              ...(adapters.wakeActivation
                ? { wakeActivation: adapters.wakeActivation }
                : {}),
              wakeAudioInput: adapters.wakeAudioInput,
              wakeWord: adapters.wakeWord,
            },
            voiceIo,
          );
          pendingCommand = result.interruption;
          return { completed: result.status !== "cancelled" };
        } finally {
          await cleanupVoiceAdapters(() => adapters.cleanup?.(), options.io);
        }
      },
    },
  ).then((result) => failures.finish(result));
}

async function validateVoiceServiceConfig(
  config: LoadedRuntimeConfig,
  env: Record<string, string | undefined>,
): Promise<void> {
  const voiceConfig = requireVoiceConfig(config);
  const desktopVoiceConfig = resolveDesktopVoiceServiceAdapterConfig(
    voiceConfig,
    config,
  );

  await validateOpenWakeWordStartup(voiceConfig, desktopVoiceConfig, env);
  validateConfiguredFeatureAdapters(config);
}
