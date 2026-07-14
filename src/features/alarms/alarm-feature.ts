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
import type {
  AlarmRecord,
  AlarmStore,
  AlarmStatus,
} from "../../ports/alarm-store.js";

const alarmCreateParameters = {
  label: { type: "string" },
  minutesFromNow: { type: "number", required: true, positive: true },
} as const satisfies FeatureCapabilityParameters;

const alarmListParameters = {} as const satisfies FeatureCapabilityParameters;
const alarmTargetParameters = {
  id: { type: "string" },
  label: { type: "string" },
} as const satisfies FeatureCapabilityParameters;

type AlarmCreateArgs = FeatureArgsFromParameters<typeof alarmCreateParameters>;
type AlarmTargetArgs = FeatureArgsFromParameters<typeof alarmTargetParameters>;

const alarmDeterministicIntentRules = [
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
  {
    capability: "alarm.acknowledge",
    match: (text) =>
      text.includes("acknowledge alarm") || text.includes("heard the alarm")
        ? {}
        : undefined,
  },
  {
    capability: "alarm.dismiss",
    match: (text) =>
      text.includes("dismiss alarm") || text.includes("stop the alarm")
        ? {}
        : undefined,
  },
  {
    capability: "alarm.cancel",
    match: (text) => {
      const match = text.match(/\bcancel alarm (?<id>alarm-\S+)\b/u);
      return match?.groups?.id ? { id: match.groups.id } : undefined;
    },
  },
] as const satisfies readonly DeterministicFeatureRule[];

export function createAlarmFeature(store: AlarmStore): FeaturePlugin {
  return defineDeterministicFeatureRules(
    defineFeature({
      id: "alarms",
      displayName: "Local Alarms",
      capabilities: {
        "alarm.acknowledge": defineCapability({
          description:
            "Acknowledge the currently ringing alarm and stop its remaining delivery attempt.",
          risk: "low",
          summary: "Acknowledge a currently ringing alarm.",
          spokenSummary: "manage local alarms",
          parameters: alarmTargetParameters,
          execute: (request, context) =>
            transitionAlarm(
              request.args,
              context,
              store,
              "ringing",
              "completed",
              "Acknowledged",
            ),
        }),
        "alarm.cancel": defineCapability({
          description:
            "Cancel a scheduled alarm before it starts ringing. This requires confirmation.",
          risk: "high",
          summary: "Cancel a scheduled local alarm.",
          spokenSummary: "manage local alarms",
          requiresConfirmation: true,
          parameters: alarmTargetParameters,
          execute: (request, context) =>
            transitionAlarm(
              request.args,
              context,
              store,
              "scheduled",
              "cancelled",
              "Cancelled",
            ),
        }),
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
        "alarm.dismiss": defineCapability({
          description:
            "Dismiss the currently ringing alarm and stop its remaining delivery attempt.",
          risk: "low",
          summary: "Dismiss a currently ringing alarm.",
          spokenSummary: "manage local alarms",
          parameters: alarmTargetParameters,
          execute: (request, context) =>
            transitionAlarm(
              request.args,
              context,
              store,
              "ringing",
              "dismissed",
              "Dismissed",
            ),
        }),
      },
    }),
    alarmDeterministicIntentRules,
  );
}

async function createAlarm(
  args: AlarmCreateArgs,
  context: AssistantContext,
  store: AlarmStore,
): Promise<FeatureResult> {
  const label = args.label ?? "alarm";
  const scheduledFor = new Date(
    context.clock.now().getTime() + args.minutesFromNow * 60_000,
  ).toISOString();
  const alarm = await store.add({
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

async function listAlarms(store: AlarmStore): Promise<FeatureResult> {
  const alarms = await store.list();

  if (alarms.length === 0) {
    return {
      text: "There are no alarms set.",
    };
  }

  return {
    data: Object.fromEntries(
      alarms.flatMap((alarm, index) => [
        [`alarm${index}Id`, alarm.id],
        [`alarm${index}Label`, alarm.label],
        [`alarm${index}ScheduledFor`, alarm.scheduledFor],
      ]),
    ),
    text: `Alarms: ${alarms
      .map((alarm) => `${alarm.id} at ${alarm.scheduledFor} (${alarm.label})`)
      .join("; ")}.`,
  };
}

async function transitionAlarm(
  args: AlarmTargetArgs,
  context: AssistantContext,
  store: AlarmStore,
  requiredStatus: AlarmStatus,
  nextStatus: AlarmStatus,
  verb: string,
): Promise<FeatureResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const selection = selectAlarm(await store.list(), args, requiredStatus);
    if (selection.kind === "response") {
      return { text: selection.text };
    }

    const alarm = selection.alarm;
    const updated = await store.update({
      changes: { nextDeliveryAt: null, status: nextStatus },
      expectedRevision: alarm.revision,
      id: alarm.id,
      updatedAt: context.clock.now().toISOString(),
    });
    if (updated) {
      return {
        data: { id: updated.id, label: updated.label, status: updated.status },
        text: `${verb} the ${updated.label} alarm.`,
      };
    }
  }

  throw new Error("Alarm changed repeatedly during lifecycle update.");
}

type AlarmSelection =
  | { alarm: AlarmRecord; kind: "alarm" }
  | { kind: "response"; text: string };

function selectAlarm(
  alarms: readonly AlarmRecord[],
  args: AlarmTargetArgs,
  requiredStatus: AlarmStatus,
): AlarmSelection {
  const matches = args.id
    ? alarms.filter((alarm) => alarm.id === args.id)
    : args.label
      ? alarms.filter(
          (alarm) => alarm.label.toLowerCase() === args.label?.toLowerCase(),
        )
      : alarms.filter((alarm) => alarm.status === requiredStatus);
  const target = args.id ?? args.label ?? requiredStatus;

  if (matches.length === 0) {
    return { kind: "response", text: `I could not find the ${target} alarm.` };
  }

  if (matches.length > 1) {
    return {
      kind: "response",
      text: `More than one alarm is labelled ${target}. Please use its ID.`,
    };
  }

  const alarm = matches[0]!;
  if (alarm.status !== requiredStatus) {
    return {
      kind: "response",
      text: `The ${alarm.label} alarm is not ${requiredStatus}.`,
    };
  }

  return { alarm, kind: "alarm" };
}
