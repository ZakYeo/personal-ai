import { createInMemoryAlarmStore } from "../../adapters/local/in-memory-alarm-store.js";
import { createAlarmFeature } from "../../features/alarms/alarm-feature.js";
import {
  defineFeatureAdapterEntry,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";

export function createAlarmFeatureRegistryEntry(): FeatureRegistryEntry {
  return {
    adapters: {
      local: defineFeatureAdapterEntry({
        create: () => createAlarmFeature(createInMemoryAlarmStore()),
        parseConfig: () => {},
      }),
    },
  };
}
