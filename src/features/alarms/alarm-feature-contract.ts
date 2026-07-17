import type {
  FeatureArgsFromParameters,
  FeatureCapabilityParameters,
} from "../../ports/feature.js";
import type { DeterministicFeatureRule } from "../../ports/deterministic-feature-rules.js";

export const alarmCreateParameters = {
  label: { type: "string" },
  minutesFromNow: { type: "number", required: true, positive: true },
  recurrenceFrequency: { type: "string" },
  recurrenceTimeZone: { type: "string" },
} as const satisfies FeatureCapabilityParameters;

export const alarmListParameters =
  {} as const satisfies FeatureCapabilityParameters;

export const alarmCalendarReminderParameters = {
  label: { type: "string" },
  localTime: {
    description: "Required when the selected calendar event is all day.",
    type: "string",
  },
  minutesBefore: { type: "number", required: true, positive: true },
  reference: { type: "string", required: true },
} as const satisfies FeatureCapabilityParameters;

export const alarmTargetParameters = {
  id: { type: "string" },
  label: { type: "string" },
} as const satisfies FeatureCapabilityParameters;

export const alarmDelayTargetParameters = {
  ...alarmTargetParameters,
  minutesFromNow: { type: "number", required: true, positive: true },
} as const satisfies FeatureCapabilityParameters;

export const alarmEditParameters = {
  ...alarmTargetParameters,
  newLabel: { type: "string", required: true },
} as const satisfies FeatureCapabilityParameters;

export type AlarmCreateArgs = FeatureArgsFromParameters<
  typeof alarmCreateParameters
>;
export type AlarmCalendarReminderArgs = FeatureArgsFromParameters<
  typeof alarmCalendarReminderParameters
>;
export type AlarmTargetArgs = FeatureArgsFromParameters<
  typeof alarmTargetParameters
>;
export type AlarmDelayTargetArgs = FeatureArgsFromParameters<
  typeof alarmDelayTargetParameters
>;
export type AlarmEditArgs = FeatureArgsFromParameters<
  typeof alarmEditParameters
>;

export const alarmDeterministicIntentRules = [
  {
    capability: "alarm.create",
    match: (text) => {
      const match = text.match(
        /\bset a (?<frequency>daily|weekly) alarm(?: to (?<label>.+?))? in (?<minutes>\d+) minutes? in (?<timeZone>[A-Za-z_]+\/[A-Za-z_]+)\b/u,
      );
      return match?.groups?.frequency &&
        match.groups.minutes &&
        match.groups.timeZone
        ? {
            label: match.groups.label ?? "alarm",
            minutesFromNow: Number(match.groups.minutes),
            recurrenceFrequency: match.groups.frequency,
            recurrenceTimeZone: match.groups.timeZone,
          }
        : undefined;
    },
  },
  {
    capability: "alarm.create",
    match: (text) => {
      const match = text.match(
        /\bset (?:an? )?alarm(?: to (?<label>.+?))? in (?<minutes>\d+) minutes?\b/u,
      );
      return match?.groups?.minutes
        ? {
            label: match.groups.label ?? "alarm",
            minutesFromNow: Number(match.groups.minutes),
          }
        : undefined;
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
    match: (text) => targetIdMatch(text, /\bcancel alarm (?<id>alarm-\S+)\b/u),
  },
  {
    capability: "alarm.snooze",
    match: (text) =>
      delayMatch(
        text,
        /\bsnooze (?:the )?alarm(?: (?<id>alarm-\S+))? for (?<minutes>\d+) minutes?\b/u,
      ),
  },
  {
    capability: "alarm.reschedule",
    match: (text) =>
      delayMatch(
        text,
        /\breschedule alarm (?<id>alarm-\S+) (?:for|in) (?<minutes>\d+) minutes?\b/u,
      ),
  },
  {
    capability: "alarm.edit",
    match: (text) => {
      const match = text.match(
        /\brename alarm (?<id>alarm-\S+) to (?<newLabel>.+)$/u,
      );
      return match?.groups?.id && match.groups.newLabel
        ? { id: match.groups.id, newLabel: match.groups.newLabel }
        : undefined;
    },
  },
] as const satisfies readonly DeterministicFeatureRule[];

function targetIdMatch(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match?.groups?.id ? { id: match.groups.id } : undefined;
}

function delayMatch(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  if (!match?.groups?.minutes) {
    return;
  }
  return {
    ...(match.groups.id ? { id: match.groups.id } : {}),
    minutesFromNow: Number(match.groups.minutes),
  };
}
