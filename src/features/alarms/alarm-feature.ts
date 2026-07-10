import type { AssistantContext } from "../../ports/assistant.js";
import type {
  FeatureArgsFromParameters,
  FeatureCapabilityParameters,
  FeaturePlugin,
  FeatureResult,
} from "../../ports/feature.js";
import {
  defineDeterministicFeatureRules,
  type DeterministicFeatureRule,
} from "../../ports/deterministic-feature-rules.js";
import { defineCapability, defineFeature } from "../../ports/feature.js";
import type { AlarmStore } from "../../ports/alarm-store.js";

const alarmCreateParameters = {
  label: { type: "string" },
  minutesFromNow: { type: "number", required: true, positive: true },
} as const satisfies FeatureCapabilityParameters;

const alarmListParameters = {} as const satisfies FeatureCapabilityParameters;

type AlarmCreateArgs = FeatureArgsFromParameters<typeof alarmCreateParameters>;

const alarmDeterministicIntentRules: DeterministicFeatureRule[] = [
  {
    capability: "alarm.create",
    match: (text) => {
      const alarmCreateMatch = text.match(
        /\bset (?:an? )?alarm(?: to (?<label>.+?))? in (?<minutes>\d+) minutes?\b/u,
      );

      if (!alarmCreateMatch?.groups?.minutes) {
        return;
      }

      return {
        label: alarmCreateMatch.groups.label ?? "alarm",
        minutesFromNow: Number(alarmCreateMatch.groups.minutes),
      };
    },
  },
  {
    capability: "alarm.list",
    match: (text) =>
      text.includes("alarm") &&
      (text.includes("list") ||
        text.includes("show") ||
        text.includes("what alarms"))
        ? {}
        : undefined,
  },
];

export function createAlarmFeature(store: AlarmStore): FeaturePlugin {
  return defineDeterministicFeatureRules(
    defineFeature({
      id: "alarms",
      displayName: "Local Alarms",
      capabilities: {
        "alarm.create": defineCapability({
          description:
            "Create a local alarm scheduled a number of minutes from now. This requires confirmation before the alarm is saved.",
          risk: "high",
          summary: "Create a local alarm after a relative delay.",
          spokenSummary: "manage local alarms",
          requiresConfirmation: true,
          parameters: alarmCreateParameters,
          execute: (request, context: AssistantContext) =>
            createAlarm(request.args, context, store),
        }),
        "alarm.list": defineCapability({
          description:
            "List the local alarms currently stored by this assistant runtime.",
          risk: "low",
          summary: "List currently stored local alarms.",
          spokenSummary: "manage local alarms",
          parameters: alarmListParameters,
          execute: () => listAlarms(store),
        }),
      },
    }),
    alarmDeterministicIntentRules,
  );
}

function createAlarm(
  args: AlarmCreateArgs,
  context: AssistantContext,
  store: AlarmStore,
): FeatureResult {
  const label = args.label ?? "alarm";
  const scheduledFor = new Date(
    context.clock.now().getTime() + args.minutesFromNow * 60_000,
  ).toISOString();
  const alarm = store.add({
    label,
    scheduledFor,
  });

  return {
    text: `Alarm set for ${scheduledFor} (${label}).`,
    data: {
      id: alarm.id,
      label: alarm.label,
      scheduledFor: alarm.scheduledFor,
    },
  };
}

function listAlarms(store: AlarmStore): FeatureResult {
  const alarms = store.list();

  if (alarms.length === 0) {
    return {
      text: "There are no alarms set.",
    };
  }

  return {
    text: `Alarms: ${alarms
      .map((alarm) => `${alarm.id} at ${alarm.scheduledFor} (${alarm.label})`)
      .join("; ")}.`,
  };
}
