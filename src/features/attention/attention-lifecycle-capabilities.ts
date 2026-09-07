import { defineCapability } from "../../application/feature.js";
import { changeAttentionRule } from "../../application/attention-commands.js";
import { describeAttentionRule } from "../../application/attention-rule-description.js";
import {
  setAttentionBudget,
  validateAttentionBudget,
} from "../../application/attention-controls.js";
import type { AttentionStore } from "../../ports/attention.js";

export function createAttentionLifecycleCapabilities(store: AttentionStore) {
  return {
    "attention.rules.list": defineCapability({
      parameters: { name: { type: "string" }, offset: { type: "number" } },
      risk: "low",
      toolChain: "read",
      summary: "List explicit attention rules and their current controls.",
      description:
        "Read a page of up to seven user-authored attention rules with exact opaque IDs and revisions. An optional exact case-insensitive name selects one rule. Offset is a zero-based integer from 0 to 23; totalCount and count describe remaining pages. No monitor is inferred or enabled by listing.",
      spokenSummary: "manage explicit attention rules",
      execute: async (request) => {
        const offset = request.args.offset ?? 0;
        if (!Number.isInteger(offset) || offset < 0 || offset > 23)
          throw new Error("Attention rule offset must be 0 to 23.");
        const state = await store.read();
        const matching = state.rules.filter(
          (rule) =>
            !request.args.name ||
            rule.name.toLocaleLowerCase() ===
              request.args.name.trim().toLocaleLowerCase(),
        );
        const rules = matching.slice(offset, offset + 7);
        const counts = {
          count: rules.length,
          totalCount: matching.length,
          dailyBudget: state.preferences.dailyBudget,
        };
        const references = Object.fromEntries(
          rules.flatMap(
            (rule, index): Array<[string, string | number]> => [
              [`rule${index}Id`, rule.id],
              [`rule${index}Revision`, rule.revision],
              [`rule${index}Name`, rule.name],
            ],
          ),
        );
        return {
          data: { ...counts, ...references },
          toolObservationData: {
            ...counts,
            ...references,
          },
          text: rules.length
            ? `Showing ${rules.length} of ${matching.length} matching rules. ${rules
                .map(
                  (rule) =>
                    `${rule.name} is ${rule.enabled ? "enabled" : "disabled"}.`,
                )
                .join(" ")}`
            : "There are no matching attention rules on this page.",
        };
      },
    }),
    "attention.rules.explain": defineCapability({
      parameters: { id: { type: "string", required: true } },
      risk: "low",
      summary: "Explain one attention rule.",
      description:
        "Read its explicit definition, provenance, quiet hours, cooling-off period and latest evaluation result.",
      spokenSummary: "manage explicit attention rules",
      execute: async (request) => {
        const state = await store.read();
        const rule = state.rules.find((rule) => rule.id === request.args.id);
        if (!rule)
          return { text: "That attention rule is no longer available." };
        const description = describeAttentionRule(rule.definition);
        const evaluation = state.evaluations.find(
          (entry) => entry.ruleId === rule.id,
        );
        return {
          data: {
            ...description.facts,
            name: rule.name,
            quietStart: rule.quietHours.start,
            quietEnd: rule.quietHours.end,
            cooldownMinutes: rule.cooldownMinutes,
            request: rule.provenance.request,
          },
          responseRewrite: "disabled",
          text: `${rule.name} checks ${description.text}. It is ${rule.enabled ? "enabled" : "disabled"}, quiet from ${rule.quietHours.start} to ${rule.quietHours.end}, with a ${rule.cooldownMinutes}-minute cooling-off period. You enabled it by asking: ${rule.provenance.request}. Latest evaluation: ${evaluation?.completed?.reason.replaceAll("_", " ") ?? "not evaluated"}.`,
          spokenText: { dateStyle: "contextual", timeZone: rule.timeZone },
        };
      },
    }),
    "attention.rules.update": defineCapability({
      parameters: {
        id: { type: "string", required: true },
        expectedRevision: { type: "number", required: true },
        action: {
          type: "string",
          required: true,
          allowedValues: ["disable", "snooze"],
        },
        minutes: { type: "number" },
      },
      risk: "low",
      summary: "Disable or snooze one explicit attention rule.",
      description:
        "Reduce interruptions for an exact rule ID and revision. Snooze for 1 to 10080 minutes; default 60. This never re-enables a disabled rule.",
      spokenSummary: "manage explicit attention rules",
      execute: async (request, context) => {
        const { id, expectedRevision, action, minutes } = request.args;
        const changed = await changeAttentionRule(
          store,
          action === "disable"
            ? { id, expectedRevision, action }
            : { id, expectedRevision, action, minutes: minutes ?? 60 },
          context.clock.now(),
        );
        return {
          data: { id, changed: !!changed },
          text: changed
            ? "Updated that attention rule."
            : "That rule changed. Please refresh the rule list.",
        };
      },
    }),
    "attention.budget.set": defineCapability({
      parameters: {
        dailyBudget: { type: "number", required: true },
        timeZone: { type: "string", required: true },
      },
      risk: "high",
      requiresConfirmation: true,
      summary: "Set the explicit daily notification budget.",
      description:
        "Set 1 to 20 attention notifications per local day in an explicit IANA timezone. Unknown delivery attempts count toward the budget. Requires confirmation.",
      spokenSummary: "manage explicit attention rules",
      confirmation: (args) => {
        validateAttentionBudget(args);
        return {
          facts: { ...args },
          text: `set the attention budget to ${args.dailyBudget} notifications per local day in ${args.timeZone}`,
        };
      },
      execute: async (request) => {
        await setAttentionBudget(store, request.args);
        return {
          data: { ...request.args },
          text: `Set the attention budget to ${request.args.dailyBudget} per local day in ${request.args.timeZone}.`,
        };
      },
    }),
  };
}
