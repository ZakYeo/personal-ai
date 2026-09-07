import { createAttentionInboxCapabilities } from "./attention-inbox-capabilities.js";
import { createAttentionLifecycleCapabilities } from "./attention-lifecycle-capabilities.js";
import type { TaskStore } from "../../ports/task-store.js";
import { defineFeature } from "../../application/feature.js";
import type { AttentionStore } from "../../ports/attention.js";
import type { WeatherProviderPort } from "../../ports/weather.js";
import { createAttentionRuleCapabilities } from "./attention-rule-capabilities.js";
import { createAttentionWeatherCapability } from "./attention-weather-capability.js";

export function createAttentionFeature(
  store: AttentionStore,
  weather?: WeatherProviderPort,
  tasks?: TaskStore,
) {
  return defineFeature({
    id: "attention",
    displayName: "Proactive Attention",
    spokenSummary: "manage explicit proactive rules and your attention inbox",
    capabilities: {
      ...createAttentionRuleCapabilities(store),
      ...createAttentionInboxCapabilities(store, tasks),
      ...createAttentionLifecycleCapabilities(store),
      "attention.weather.enable": createAttentionWeatherCapability(
        store,
        weather,
      ),
    },
  });
}
