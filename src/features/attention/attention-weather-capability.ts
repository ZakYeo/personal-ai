import { normalizeAttentionRuleSettings } from "../../application/attention-rule-policy.js";
import { defineCapability } from "../../application/feature.js";
import { decodeWeatherWatchCondition } from "../../application/weather-watch-condition-policy.js";
import { selectWeatherLocation } from "../../application/weather-location-selection.js";
import { validateWeatherLocationCandidates } from "../../application/weather-policy.js";
import type { AttentionStore } from "../../ports/attention.js";
import type { WeatherProviderPort } from "../../ports/weather.js";
import {
  attentionRuleParameters,
  saveAttentionRule,
} from "./attention-rule-capabilities.js";

export function createAttentionWeatherCapability(
  store: AttentionStore,
  weather?: WeatherProviderPort,
) {
  return defineCapability({
    parameters: {
      ...attentionRuleParameters,
      location: { type: "string", required: true },
      metric: { type: "string", required: true },
      operator: { type: "string", required: true },
      threshold: { type: "number", required: true },
      periodHours: { type: "number", required: true },
    },
    summary:
      "Notice a chosen weather threshold during a bounded forecast period.",
    description:
      "Enable a persistent convenience weather rule for an explicit uniquely identified place, metric precipitation, temperature or windSpeed, operator atLeast or temperature atMost, threshold in metric units, and a 1 to 48 hour rolling forecast. Requires confirmation; never an emergency alert.",
    spokenSummary: "enable explicit proactive attention rules",
    risk: "high",
    requiresConfirmation: true,
    confirmation: (args, context) => {
      const condition = decodeWeatherWatchCondition(args);
      const settings = normalizeAttentionRuleSettings({
        name: args.name,
        timeZone: args.timeZone ?? context.config.assistant.timeZone,
        quietHours: {
          start: args.quietStart ?? "22:00",
          end: args.quietEnd ?? "08:00",
        },
        cooldownMinutes: args.cooldownMinutes ?? 60,
        request: "Explicit confirmation declaration",
      });
      if (
        !Number.isInteger(args.periodHours) ||
        args.periodHours < 1 ||
        args.periodHours > 48
      )
        throw new Error("Weather attention period must be 1 to 48 hours.");
      const facts = {
        name: args.name,
        location: args.location,
        ...condition,
        periodHours: args.periodHours,
        timeZone: settings.timeZone,
        quietStart: settings.quietHours.start,
        quietEnd: settings.quietHours.end,
        cooldownMinutes: settings.cooldownMinutes,
      };
      return {
        facts,
        text: `enable ${facts.name} for ${facts.metric} ${facts.operator} ${facts.threshold} ${facts.unit} in ${facts.location} over the next ${facts.periodHours} hours, in ${facts.timeZone}, quiet from ${facts.quietStart} to ${facts.quietEnd}, with a ${facts.cooldownMinutes}-minute cooling-off period, subject to the daily notification budget`,
      };
    },
    execute: async (request, context) => {
      if (!weather) throw new Error("Attention weather source is unavailable.");
      const args = request.args;
      const candidates = await weather.findLocations(
        { place: args.location },
        { ...(context.signal ? { signal: context.signal } : {}) },
      );
      validateWeatherLocationCandidates(candidates);
      const selected = selectWeatherLocation(
        args.location,
        candidates,
        "unique",
      );
      if (selected.kind !== "selected")
        return {
          kind: "resumable_clarification",
          parameter: "location",
          text: "Please specify a uniquely identified place, including its country, for this weather rule.",
        };
      return saveAttentionRule(
        store,
        args,
        {
          kind: "material_weather",
          location: selected.location,
          condition: decodeWeatherWatchCondition(args),
          periodHours: args.periodHours,
        },
        context,
      );
    },
  });
}
