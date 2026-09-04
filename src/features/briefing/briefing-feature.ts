import { defineCapability, defineFeature } from "../../application/feature.js";
import { defineDeterministicFeatureRules } from "../../application/deterministic-feature-rules.js";
import type {
  DailyBriefingAggregatorPort,
  BriefingStore,
} from "../../ports/briefing.js";
import type {
  FeatureArgsFromParameters,
  FeatureCapabilityParameters,
  FeatureExecutionContext,
} from "../../ports/feature.js";
import { createBriefingPreferenceCapabilities } from "./briefing-preferences.js";

const getParameters = {
  mode: {
    allowedValues: ["short", "standard", "attention-only"],
    type: "string",
  },
  sinceLast: { type: "boolean" },
} as const satisfies FeatureCapabilityParameters;

type GetArgs = FeatureArgsFromParameters<typeof getParameters>;

export function createBriefingFeature(
  aggregator: DailyBriefingAggregatorPort,
  store: BriefingStore,
) {
  return defineDeterministicFeatureRules(
    defineFeature({
      capabilities: {
        "briefing.get_daily": defineCapability({
          description:
            "Get a bounded daily briefing from configured read-only sources, optionally comparing it with the last delivered briefing.",
          execute: (request, context) =>
            getDailyBriefing(aggregator, store, request.args, context),
          parameters: getParameters,
          risk: "low",
          spokenSummary: "get a concise daily briefing",
          summary: "Get today's configured daily briefing.",
          toolChain: "read",
        }),
        ...createBriefingPreferenceCapabilities(store),
      },
      displayName: "Daily Briefings",
      id: "briefing",
      spokenSummary: "get and schedule concise daily briefings",
    }),
    [
      {
        capability: "briefing.get_daily",
        match: (text) =>
          /\b(?:what does my day look like|daily briefing|brief me)\b/u.test(
            text,
          )
            ? { sinceLast: false }
            : /\bwhat changed since (?:this morning|my last briefing)\b/u.test(
                  text,
                )
              ? { sinceLast: true }
              : undefined,
      },
    ],
  );
}

async function getDailyBriefing(
  aggregator: DailyBriefingAggregatorPort,
  store: BriefingStore,
  args: GetArgs,
  context: FeatureExecutionContext,
) {
  const preferences = await store.getPreferences();
  const lastSnapshot = args.sinceLast
    ? await store.getLastSnapshot()
    : undefined;
  if (args.sinceLast && !lastSnapshot) {
    return {
      responseRewrite: "disabled" as const,
      text: "I do not have an earlier delivered briefing to compare with yet.",
    };
  }
  const diagnostics: unknown[] = [];
  const result = await aggregator.create(
    {
      length: args.mode ?? preferences.length,
      sections: preferences.sections,
      sinceLast: args.sinceLast ?? false,
      timeZone:
        preferences.schedule?.timeZone ?? context.config.assistant.timeZone,
      topics: preferences.searchTopics,
    },
    {
      ...(lastSnapshot ? { lastSnapshot } : {}),
      now: context.clock.now(),
      reportDiagnostic: (error) => diagnostics.push(error),
      ...(context.signal ? { signal: context.signal } : {}),
    },
  );
  await store.saveSnapshot(result.snapshot);
  return {
    ...(result.citations.length > 0 ? { citations: result.citations } : {}),
    data: { ...result.facts, briefingCreatedAt: result.snapshot.createdAt },
    ...(diagnostics.length > 0
      ? {
          diagnostics: diagnostics.map((cause) => ({
            cause,
            message: "A briefing source was unavailable.",
          })),
        }
      : {}),
    ...(result.usedInternet ? { responseRewrite: "disabled" as const } : {}),
    spokenText: {
      dateStyle: "contextual" as const,
      timeZone: result.snapshot.timeZone,
    },
    text: result.text,
    toolObservationData: { briefingCreatedAt: result.snapshot.createdAt },
  };
}
