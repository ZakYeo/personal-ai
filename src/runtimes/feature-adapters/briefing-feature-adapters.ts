import { bindRuntimeService } from "../runtime-service-registry.js";
import {
  briefingStoreService,
  alarmStoreService,
  calendarSearchService,
  internetSearchService,
  taskStoreService,
  weatherProviderService,
} from "../feature-source-services.js";
import { createDailyBriefingAggregator } from "../../application/briefing-policy.js";
import {
  createAlarmBriefingSource,
  createCalendarBriefingSource,
  createInternetBriefingSource,
  createProfileBriefingSource,
  createTaskBriefingSource,
  createWeatherBriefingSource,
} from "../../application/briefing-sources.js";
import { createFileBriefingStore } from "../../adapters/local/file-briefing-store.js";
import { createInMemoryBriefingStore } from "../../adapters/local/in-memory-briefing-store.js";
import { createBriefingFeature } from "../../features/briefing/briefing-feature.js";
import type {
  BriefingSourcePort,
  BriefingStore,
} from "../../ports/briefing.js";
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import type { RuntimeBackgroundTaskContext } from "../background-task.js";
import { isRecord } from "../config/config-parse-utils.js";
import {
  defineConfiglessFeatureAdapterEntry,
  defineFeatureAdapter,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";
import { resolveLocalStatePath } from "../local-state-path.js";
import {
  assistantPersonalizationReaderService,
  personalContextReaderService,
} from "../profile-runtime-services.js";
import type { RuntimeServiceRegistry } from "../runtime-service-registry.js";
import { runBriefingScheduler } from "../briefing/briefing-scheduler.js";

const fileBriefingAdapter = defineFeatureAdapter({
  parseConfig: (featureConfig) => {
    const state = featureConfig.state;
    if (
      !isRecord(state) ||
      typeof state.path !== "string" ||
      state.path.trim().length === 0
    ) {
      throw new Error(
        'Config feature "briefing".state.path must be a non-empty string.',
      );
    }
    return { filePath: state.path };
  },
});

interface BriefingRegistryDependencies {
  readonly configDirectory?: string;
  readonly notificationDelivery?: NotificationDeliveryPort;
}

export function createBriefingFeatureRegistryEntry(
  dependencies: BriefingRegistryDependencies = {},
): FeatureRegistryEntry {
  return {
    adapters: {
      file: fileBriefingAdapter.bind({
        inspect: (config) => ({
          processing: [{ name: "State storage", location: "local" }],
          statePaths: [config.filePath],
        }),
        provideServices: ({ adapterConfig, runtime }) => [
          bindRuntimeService(
            briefingStoreService,
            createFileBriefingStore({
              filePath: resolveLocalStatePath(
                adapterConfig.filePath,
                dependencies.configDirectory,
              ),
              now: () => runtime.clock.now(),
              timeZone: "UTC",
            }),
          ),
        ],
        create: (_context, services) =>
          createComposition(
            services.require(briefingStoreService),
            services,
            dependencies.notificationDelivery,
          ),
      }),
      local: defineConfiglessFeatureAdapterEntry({
        inspect: () => ({
          processing: [{ name: "Local operations", location: "local" }],
          statePaths: [],
        }),
        provideServices: ({ runtime }) => [
          bindRuntimeService(
            briefingStoreService,
            createInMemoryBriefingStore({
              now: () => runtime.clock.now(),
              timeZone: "UTC",
            }),
          ),
        ],
        create: (_context, services) =>
          createComposition(
            services.require(briefingStoreService),
            services,
            dependencies.notificationDelivery,
          ),
      }),
    },
  };
}

function createComposition(
  store: BriefingStore,
  services: RuntimeServiceRegistry,
  delivery: NotificationDeliveryPort | undefined,
) {
  const aggregator = createDailyBriefingAggregator(
    createBriefingSources(services),
  );
  const feature = createBriefingFeature(aggregator, store);
  if (!delivery) return feature;
  return {
    backgroundTasks: [
      {
        failureReason: "briefing scheduled delivery failed",
        id: "briefing.delivery",
        run: (context: RuntimeBackgroundTaskContext) =>
          runBriefingScheduler({
            aggregator,
            clock: context.clock,
            delivery,
            intervalMs: 60_000,
            reportFailure: (error) => context.reportFailure(error),
            shutdownSignal: context.shutdownSignal,
            store,
            ...(context.timer ? { timer: context.timer } : {}),
          }),
      },
    ],
    feature,
  };
}

export function createBriefingSources(
  services: RuntimeServiceRegistry,
  maxItems: 1 | 10 = 10,
): BriefingSourcePort[] {
  const sources: BriefingSourcePort[] = [];
  const personalization = services.get(assistantPersonalizationReaderService);
  const personalContext = services.get(personalContextReaderService);
  const calendar = services.get(calendarSearchService);
  const weather = services.get(weatherProviderService);
  const alarms = services.get(alarmStoreService);
  const tasks = services.get(taskStoreService);
  const internet = services.get(internetSearchService);
  if (personalization || personalContext) {
    sources.push(
      createProfileBriefingSource({
        ...(personalContext ? { personalContext } : {}),
        ...(personalization ? { personalization } : {}),
      }),
    );
  }
  if (calendar) sources.push(createCalendarBriefingSource(calendar, maxItems));
  if (weather) {
    sources.push(createWeatherBriefingSource(weather, personalContext));
  }
  if (alarms) sources.push(createAlarmBriefingSource(alarms));
  if (tasks) sources.push(createTaskBriefingSource(tasks, maxItems));
  if (internet) sources.push(createInternetBriefingSource(internet, 2));
  return sources;
}
