import { describeAttentionRule } from "../../application/attention-rule-description.js";
import {
  defineCapability,
  type FeatureArgsFromParameters,
  type FeatureCapabilityParameters,
  type FeatureExecutionContext,
} from "../../application/feature.js";
import { enableAttentionRule } from "../../application/attention-commands.js";
import { normalizeAttentionRuleInput } from "../../application/attention-rule-policy.js";
import type {
  AttentionRuleDefinition,
  AttentionStore,
} from "../../ports/attention.js";
import type { AssistantContext } from "../../ports/assistant.js";

export const attentionRuleParameters = {
  name: { type: "string", required: true },
  timeZone: {
    type: "string",
    description:
      "Explicit IANA timezone, or omit to use the assistant timezone.",
  },
  quietStart: {
    type: "string",
    description: "Local quiet-hour start, default 22:00.",
  },
  quietEnd: {
    type: "string",
    description: "Local quiet-hour end, default 08:00.",
  },
  cooldownMinutes: {
    type: "number",
    description: "Minimum interval from 1 to 1440 minutes, default 60.",
  },
} as const satisfies FeatureCapabilityParameters;
type CommonArgs = FeatureArgsFromParameters<typeof attentionRuleParameters>;

function attentionRuleInput(
  args: CommonArgs,
  definition: AttentionRuleDefinition,
  context: AssistantContext,
  request: string,
) {
  return normalizeAttentionRuleInput({
    name: args.name,
    definition,
    timeZone: args.timeZone ?? context.config.assistant.timeZone,
    quietHours: {
      start: args.quietStart ?? "22:00",
      end: args.quietEnd ?? "08:00",
    },
    cooldownMinutes: args.cooldownMinutes ?? 60,
    request,
  });
}
export async function saveAttentionRule(
  store: AttentionStore,
  args: CommonArgs,
  definition: AttentionRuleDefinition,
  context: FeatureExecutionContext,
) {
  const input = attentionRuleInput(
    args,
    definition,
    context,
    context.trustedInputText ?? `Enable ${args.name}`,
  );
  const rule = await enableAttentionRule(store, input, context.clock.now());
  return {
    data: {
      id: rule.id,
      name: rule.name,
      timeZone: rule.timeZone,
      quietStart: rule.quietHours.start,
      quietEnd: rule.quietHours.end,
      cooldownMinutes: rule.cooldownMinutes,
      revision: rule.revision,
    },
    text: `Enabled ${rule.name}. Quiet hours are ${rule.quietHours.start} to ${rule.quietHours.end}, with at least ${rule.cooldownMinutes} minutes between notifications from this rule.`,
  };
}

function confirmRule(
  args: CommonArgs,
  definition: AttentionRuleDefinition,
  context: AssistantContext,
) {
  const input = attentionRuleInput(
    args,
    definition,
    context,
    "Explicit confirmation declaration",
  );
  const described = describeAttentionRule(input.definition);
  const facts = {
    ...described.facts,
    name: input.name,
    timeZone: input.timeZone,
    quietStart: input.quietHours.start,
    quietEnd: input.quietHours.end,
    cooldownMinutes: input.cooldownMinutes,
  };
  return {
    facts,
    text: `enable ${input.name} for ${described.text}, in ${input.timeZone}, quiet from ${input.quietHours.start} to ${input.quietHours.end}, with a ${input.cooldownMinutes}-minute cooling-off period, subject to the daily notification budget`,
  };
}
const enablePolicy = {
  risk: "high",
  requiresConfirmation: true,
  spokenSummary: "enable explicit proactive attention rules",
} as const;
export function createAttentionRuleCapabilities(store: AttentionStore) {
  return {
    "attention.calendar.enable": defineCapability({
      ...enablePolicy,
      parameters: {
        ...attentionRuleParameters,
        leadMinutes: { type: "number", required: true },
      },
      summary: "Notice upcoming calendar events.",
      description:
        "Explicitly enable notices for events starting within 1 to 1440 minutes. Requires confirmation.",
      confirmation: (args, context) =>
        confirmRule(
          args,
          { kind: "upcoming_calendar", leadMinutes: args.leadMinutes },
          context,
        ),
      execute: (request, context) =>
        saveAttentionRule(
          store,
          request.args,
          { kind: "upcoming_calendar", leadMinutes: request.args.leadMinutes },
          context,
        ),
    }),
    "attention.tasks.enable": defineCapability({
      ...enablePolicy,
      parameters: {
        ...attentionRuleParameters,
        daysAhead: { type: "number", required: true },
      },
      summary: "Notice open due tasks.",
      description:
        "Explicitly enable notices for open tasks due within 0 to 7 days. Requires confirmation.",
      confirmation: (args, context) =>
        confirmRule(
          args,
          { kind: "due_tasks", daysAhead: args.daysAhead },
          context,
        ),
      execute: (request, context) =>
        saveAttentionRule(
          store,
          request.args,
          { kind: "due_tasks", daysAhead: request.args.daysAhead },
          context,
        ),
    }),
    "attention.conflicts.enable": defineCapability({
      ...enablePolicy,
      parameters: {
        ...attentionRuleParameters,
        lookAheadHours: { type: "number", required: true },
      },
      summary: "Notice conflicting commitments.",
      description:
        "Explicitly enable calendar overlap notices within 1 to 48 hours. Requires confirmation.",
      confirmation: (args, context) =>
        confirmRule(
          args,
          {
            kind: "conflicting_commitments",
            lookAheadHours: args.lookAheadHours,
          },
          context,
        ),
      execute: (request, context) =>
        saveAttentionRule(
          store,
          request.args,
          {
            kind: "conflicting_commitments",
            lookAheadHours: request.args.lookAheadHours,
          },
          context,
        ),
    }),
    "attention.health.enable": defineCapability({
      ...enablePolicy,
      parameters: attentionRuleParameters,
      summary: "Notice assistant source and delivery problems.",
      description:
        "Explicitly enable notices of failed sources, missed alarms and uncertain reminder deliveries. Requires confirmation.",
      confirmation: (args, context) =>
        confirmRule(args, { kind: "runtime_health" }, context),
      execute: (request, context) =>
        saveAttentionRule(
          store,
          request.args,
          { kind: "runtime_health" },
          context,
        ),
    }),
    "attention.morning.enable": defineCapability({
      ...enablePolicy,
      parameters: {
        ...attentionRuleParameters,
        localTime: { type: "string", required: true },
      },
      summary: "Enable one explicit morning routine.",
      description:
        "Enable one morning routine at an explicit local time from fixed profile, calendar, task and weather reads. Requires confirmation.",
      confirmation: (args, context) =>
        confirmRule(
          args,
          { kind: "morning_routine", localTime: args.localTime },
          context,
        ),
      execute: (request, context) =>
        saveAttentionRule(
          store,
          request.args,
          { kind: "morning_routine", localTime: request.args.localTime },
          context,
        ),
    }),
  };
}
