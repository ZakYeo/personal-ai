import { createMessagingFeature } from "../../features/messaging/messaging-feature.js";
import {
  defineConfiglessFeatureAdapterEntry,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";

export function createMessagingFeatureRegistryEntry(): FeatureRegistryEntry {
  return {
    adapters: {
      mock: defineConfiglessFeatureAdapterEntry({
        inspect: () => ({
          processing: [{ name: "Local operations", location: "local" }],
          statePaths: [],
        }),
        create: () => createMessagingFeature(),
      }),
    },
  };
}
