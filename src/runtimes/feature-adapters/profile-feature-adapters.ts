import {
  createFileProfileStore,
  type FileProfileStoreDependencies,
} from "../../adapters/local/file-profile-store.js";
import { createInMemoryProfileStore } from "../../adapters/local/in-memory-profile-store.js";
import { createProfileContextReaders } from "../../application/profile-context.js";
import { createProfileFeature } from "../../features/profile/profile-feature.js";
import type { ProfileStorePort } from "../../ports/profile-store.js";
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
  profileStoreService,
} from "../profile-runtime-services.js";
import {
  bindRuntimeService,
  type RuntimeServiceBinding,
} from "../runtime-service-registry.js";

interface ProfileFeatureRegistryDependencies extends FileProfileStoreDependencies {
  configDirectory?: string;
}

const fileProfileAdapter = defineFeatureAdapter({
  parseConfig: parseFileProfileStoreConfig,
});

export function createProfileFeatureRegistryEntry(
  dependencies: ProfileFeatureRegistryDependencies = {},
): FeatureRegistryEntry {
  const { configDirectory, ...storeDependencies } = dependencies;
  return {
    adapters: {
      file: fileProfileAdapter.bind({
        create: (_context, services) =>
          createProfileFeature(services.require(profileStoreService)),
        provideServices: ({ adapterConfig, runtime }) =>
          provideProfileServices(
            createFileProfileStore({
              ...storeDependencies,
              filePath: resolveLocalStatePath(
                adapterConfig.filePath,
                configDirectory,
              ),
              now: () => runtime.clock.now(),
            }),
          ),
      }),
      local: defineConfiglessFeatureAdapterEntry({
        create: (_context, services) =>
          createProfileFeature(services.require(profileStoreService)),
        provideServices: ({ runtime }) =>
          provideProfileServices(
            createInMemoryProfileStore({ now: () => runtime.clock.now() }),
          ),
      }),
    },
  };
}

function provideProfileServices(
  store: ProfileStorePort,
): readonly RuntimeServiceBinding[] {
  const readers = createProfileContextReaders(store);
  return [
    bindRuntimeService(profileStoreService, store),
    bindRuntimeService(
      assistantPersonalizationReaderService,
      readers.personalization,
    ),
    bindRuntimeService(personalContextReaderService, readers.personalContext),
  ];
}

function parseFileProfileStoreConfig(featureConfig: Record<string, unknown>): {
  filePath: string;
} {
  const state = featureConfig.state;
  if (
    !isRecord(state) ||
    typeof state.path !== "string" ||
    state.path.trim().length === 0
  ) {
    throw new Error(
      'Config feature "profile".state.path must be a non-empty string.',
    );
  }
  return { filePath: state.path };
}
