import {
  createFileAttentionStore,
  createInMemoryAttentionStore,
} from "../../adapters/local/attention-store.js";
import { createAttentionSourceReader } from "../../application/attention-sources.js";
import { createAttentionHealthSource } from "../../application/attention-health-source.js";
import { createAttentionMorningSource } from "../../application/attention-morning.js";
import { isCanonicalTimeZoneIdentifier } from "../../application/temporal-policy.js";
import { createAttentionFeature } from "../../features/attention/attention-feature.js";
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import type { RuntimeBackgroundTaskContext } from "../background-task.js";
import { isRecord } from "../config/config-parse-utils.js";
import {
  defineFeatureAdapter,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";
import {
  attentionStoreService,
  alarmStoreService,
  briefingStoreService,
  calendarSearchService,
  taskStoreService,
  weatherProviderService,
} from "../feature-source-services.js";
import { resolveLocalStatePath } from "../local-state-path.js";
import {
  bindRuntimeService,
  type RuntimeServiceRegistry,
} from "../runtime-service-registry.js";
import { createBriefingSources } from "./briefing-feature-adapters.js";
import { runAttentionLoop } from "../attention/attention-loop.js";

interface AttentionRegistryDependencies {
  configDirectory?: string;
  notificationDelivery?: NotificationDeliveryPort;
}
const localAdapter = defineFeatureAdapter({ parseConfig: parseTimeZone });
const fileAdapter = defineFeatureAdapter({
  parseConfig: (config) => {
    const parsed = parseTimeZone(config);
    if (
      !isRecord(config.state) ||
      typeof config.state.path !== "string" ||
      !config.state.path.trim()
    )
      throw new Error(
        'Config feature "attention".state.path must be a non-empty string.',
      );
    return { ...parsed, filePath: config.state.path };
  },
});
export function createAttentionFeatureRegistryEntry(
  dependencies: AttentionRegistryDependencies = {},
): FeatureRegistryEntry {
  return {
    adapters: {
      local: localAdapter.bind({
        inspect: () => ({
          processing: [{ name: "Local attention state", location: "local" }],
          statePaths: [],
        }),
        provideServices: ({ adapterConfig }) => [
          bindRuntimeService(
            attentionStoreService,
            createInMemoryAttentionStore(adapterConfig),
          ),
        ],
        create: ({ adapterConfig }, services) =>
          composeAttention(
            services,
            adapterConfig.timeZone,
            dependencies.notificationDelivery,
          ),
      }),
      file: fileAdapter.bind({
        inspect: (config) => ({
          processing: [{ name: "State storage", location: "local" }],
          statePaths: [config.filePath],
        }),
        provideServices: ({ adapterConfig }) => [
          bindRuntimeService(
            attentionStoreService,
            createFileAttentionStore({
              timeZone: adapterConfig.timeZone,
              filePath: resolveLocalStatePath(
                adapterConfig.filePath,
                dependencies.configDirectory,
              ),
            }),
          ),
        ],
        create: ({ adapterConfig }, services) =>
          composeAttention(
            services,
            adapterConfig.timeZone,
            dependencies.notificationDelivery,
          ),
      }),
    },
  };
}
function composeAttention(
  services: RuntimeServiceRegistry,
  timeZone: string,
  delivery?: NotificationDeliveryPort,
) {
  const store = services.require(attentionStoreService);
  const calendar = services.get(calendarSearchService);
  const tasks = services.get(taskStoreService);
  const weather = services.get(weatherProviderService);
  const alarms = services.get(alarmStoreService);
  const briefing = services.get(briefingStoreService);
  const feature = createAttentionFeature(store, {
    ...(weather ? { weather } : {}),
    ...(tasks ? { tasks } : {}),
    ...(calendar ? { calendar } : {}),
  });
  return {
    feature,
    backgroundTasks: [
      {
        id: "attention.evaluate",
        failureReason: "attention evaluation failed",
        run: (context: RuntimeBackgroundTaskContext) => {
          const reader = createAttentionSourceReader({
            ...(calendar ? { calendar } : {}),
            ...(tasks ? { tasks } : {}),
            ...(weather ? { weather } : {}),
            health: createAttentionHealthSource({
              reportDiagnostic: (error) => context.reportFailure(error),
              attention: store,
              timeZone,
              ...(tasks ? { tasks } : {}),
              ...(alarms ? { alarms } : {}),
            }),
            ...(briefing
              ? {
                  morning: createAttentionMorningSource({
                    store: briefing,
                    sources: createBriefingSources(services, 1),
                    reportDiagnostic: (error) => context.reportFailure(error),
                  }),
                }
              : {}),
          });
          return runAttentionLoop(
            { store, reader, ...(delivery ? { delivery } : {}) },
            context,
          );
        },
      },
    ],
  };
}
function parseTimeZone(config: Record<string, unknown>): { timeZone: string } {
  if (
    typeof config.timeZone !== "string" ||
    !isCanonicalTimeZoneIdentifier(config.timeZone)
  )
    throw new Error(
      'Config feature "attention" requires an explicit valid timezone in timeZone.',
    );
  return { timeZone: config.timeZone };
}
