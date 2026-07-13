import { createMessagingFeature } from "../../features/messaging/messaging-feature.js";
import {
  defineFeatureAdapterEntry,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";

export function createMessagingFeatureRegistryEntry(): FeatureRegistryEntry {
  return {
    adapters: {
      mock: defineFeatureAdapterEntry({
        create: () => createMessagingFeature(),
        parseConfig: () => {},
      }),
    },
  };
}
