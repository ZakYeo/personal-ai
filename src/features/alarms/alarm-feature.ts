import type { AssistantContext } from "../../ports/assistant.js";
import type { FeaturePlugin } from "../../ports/feature.js";
import { defineCapability, defineFeature } from "../../ports/feature.js";
import { defineDeterministicFeatureRules } from "../../ports/deterministic-feature-rules.js";
import type { AlarmStore } from "../../ports/alarm-store.js";
import {
  alarmCreateParameters,
  alarmDelayTargetParameters,
  alarmDeterministicIntentRules,
  alarmEditParameters,
  alarmListParameters,
  alarmTargetParameters,
} from "./alarm-feature-contract.js";
import {
  acknowledgeAlarm,
  cancelAlarm,
  createAlarm,
  dismissAlarm,
  editAlarm,
  listAlarms,
  rescheduleAlarm,
  snoozeAlarm,
} from "./alarm-operations.js";

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
            acknowledgeAlarm(request.args, context, store),
        }),
        "alarm.cancel": defineCapability({
          description:
            "Cancel a scheduled or snoozed alarm. This requires confirmation.",
          risk: "high",
          summary: "Cancel a pending local alarm.",
          spokenSummary: "manage local alarms",
          requiresConfirmation: true,
          parameters: alarmTargetParameters,
          confirmation: (args) => ({
            facts: {
              ...(args.id ? { id: args.id } : {}),
              ...(args.label ? { label: args.label } : {}),
            },
            text: `cancel the ${formatAlarmTarget(args)} alarm`,
          }),
          execute: (request, context) =>
            cancelAlarm(request.args, context, store),
        }),
        "alarm.create": defineCapability({
          description:
            "Create a one-shot, daily, or weekly local alarm scheduled a number of minutes from now. Recurrence requires an explicit IANA timezone. This requires confirmation before the alarm is saved.",
          risk: "high",
          summary:
            "Create a one-shot or recurring local alarm after a relative delay.",
          spokenSummary: "manage local alarms",
          requiresConfirmation: true,
          parameters: alarmCreateParameters,
          confirmation: (args, context) => {
            const scheduledFor = relativeTime(
              context.clock.now(),
              args.minutesFromNow,
            );
            const label = args.label ?? "alarm";
            return {
              facts: {
                label,
                minutesFromNow: args.minutesFromNow,
                ...(args.recurrenceFrequency
                  ? { recurrenceFrequency: args.recurrenceFrequency }
                  : {}),
                ...(args.recurrenceTimeZone
                  ? { recurrenceTimeZone: args.recurrenceTimeZone }
                  : {}),
                scheduledFor,
              },
              text: `set the ${label} alarm for ${scheduledFor}${
                args.recurrenceFrequency && args.recurrenceTimeZone
                  ? `, repeating ${args.recurrenceFrequency} in ${args.recurrenceTimeZone}`
                  : ""
              }`,
            };
          },
          execute: (request, context: AssistantContext) =>
            createAlarm(request.args, context, store),
        }),
        "alarm.dismiss": defineCapability({
          description:
            "Dismiss the currently ringing alarm and stop its remaining delivery attempt.",
          risk: "low",
          summary: "Dismiss a currently ringing alarm.",
          spokenSummary: "manage local alarms",
          parameters: alarmTargetParameters,
          execute: (request, context) =>
            dismissAlarm(request.args, context, store),
        }),
        "alarm.edit": defineCapability({
          description: "Rename a scheduled or snoozed local alarm.",
          risk: "low",
          summary: "Rename a pending local alarm.",
          spokenSummary: "manage local alarms",
          parameters: alarmEditParameters,
          execute: (request, context) =>
            editAlarm(request.args, context, store),
        }),
        "alarm.list": defineCapability({
          description:
            "List local alarms with their human-facing lifecycle status.",
          risk: "low",
          summary: "List local alarms and their current status.",
          spokenSummary: "manage local alarms",
          parameters: alarmListParameters,
          execute: () => listAlarms(store),
        }),
        "alarm.reschedule": defineCapability({
          description:
            "Move a scheduled or snoozed alarm to a new relative time. This requires confirmation.",
          risk: "high",
          summary: "Reschedule a pending local alarm.",
          spokenSummary: "manage local alarms",
          requiresConfirmation: true,
          parameters: alarmDelayTargetParameters,
          confirmation: (args, context) => {
            const scheduledFor = relativeTime(
              context.clock.now(),
              args.minutesFromNow,
            );
            return {
              facts: {
                ...(args.id ? { id: args.id } : {}),
                ...(args.label ? { label: args.label } : {}),
                minutesFromNow: args.minutesFromNow,
                scheduledFor,
              },
              text: `reschedule the ${formatAlarmTarget(args)} alarm for ${scheduledFor}`,
            };
          },
          execute: (request, context) =>
            rescheduleAlarm(request.args, context, store),
        }),
        "alarm.snooze": defineCapability({
          description:
            "Snooze the currently ringing alarm for a number of minutes.",
          risk: "low",
          summary: "Snooze a currently ringing local alarm.",
          spokenSummary: "manage local alarms",
          parameters: alarmDelayTargetParameters,
          execute: (request, context) =>
            snoozeAlarm(request.args, context, store),
        }),
      },
    }),
    alarmDeterministicIntentRules,
  );
}

function relativeTime(now: Date, minutesFromNow: number): string {
  return new Date(now.getTime() + minutesFromNow * 60_000).toISOString();
}

function formatAlarmTarget(input: { id?: string; label?: string }): string {
  return input.label ?? input.id ?? "selected";
}
