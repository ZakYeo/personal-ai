import { defineDeterministicFeatureRules } from "../../application/deterministic-feature-rules.js";
import { attentionDeterministicRules } from "./attention-deterministic-rules.js";
import type { CalendarSearchPort } from "../../ports/calendar.js";
import { createAttentionPlanningCapability } from "./attention-planning-capability.js";
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
  sources: {
    weather?: WeatherProviderPort;
    tasks?: TaskStore;
    calendar?: CalendarSearchPort;
  } = {},
) {
  return defineDeterministicFeatureRules(
    defineFeature({
      id: "attention",
      displayName: "Proactive Attention",
      spokenSummary: "manage explicit proactive rules and your attention inbox",
      capabilities: {
        "attention.plan_day": createAttentionPlanningCapability(sources),
        ...createAttentionRuleCapabilities(store),
        ...createAttentionInboxCapabilities(store, sources.tasks),
        ...createAttentionLifecycleCapabilities(store),
        "attention.weather.enable": createAttentionWeatherCapability(
          store,
          sources.weather,
        ),
      },
    }),
    attentionDeterministicRules,
  );
}
