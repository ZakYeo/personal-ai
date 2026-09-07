import type {
  AttentionEvaluation,
  AttentionState,
} from "../../ports/attention.js";
import { parseAttentionRule } from "./attention-rule-schema.js";
import { parseAttentionInboxItem } from "./attention-inbox-schema.js";
import {
  attentionFields as field,
  invalidAttentionState,
} from "./attention-state-fields.js";

export function parseAttentionState(value: unknown): AttentionState {
  const item = field.record(value, [
    "version",
    "revision",
    "nextId",
    "preferences",
    "rules",
    "inbox",
    "evaluations",
  ]);
  if (item.version !== 1) throw invalidAttentionState();
  const preferences = field.record(item.preferences, [
    "dailyBudget",
    "timeZone",
  ]);
  const state: AttentionState = {
    version: 1,
    revision: field.integer(item.revision),
    nextId: field.integer(item.nextId),
    preferences: {
      dailyBudget: field.integer(preferences.dailyBudget, 1, 20),
      timeZone: field.timeZone(preferences.timeZone),
    },
    rules: field.array(item.rules, 24, parseAttentionRule),
    inbox: field.array(item.inbox, 256, parseAttentionInboxItem),
    evaluations: field.array(item.evaluations, 24, parseEvaluation),
  };
  unique(state.rules.map((rule) => rule.id));
  unique(state.rules.map((rule) => rule.name.trim().toLocaleLowerCase()));
  unique(state.inbox.map((entry) => entry.id));
  unique(state.inbox.map((entry) => `${entry.ruleId}:${entry.key}`));
  unique(state.evaluations.map((entry) => entry.ruleId));
  if (
    state.evaluations.some(
      (evaluation) =>
        !state.rules.some(
          (rule) =>
            rule.id === evaluation.ruleId &&
            evaluation.ruleRevision <= rule.revision,
        ),
    )
  )
    throw invalidAttentionState();
  return state;
}

function parseEvaluation(value: unknown): AttentionEvaluation {
  const item = field.record(value, [
    "ruleId",
    "ruleRevision",
    "slot",
    "completed",
  ]);
  const slot = field.integer(item.slot, 0);
  const completed =
    item.completed === undefined
      ? undefined
      : field.record(item.completed, ["slot", "evaluatedAt", "reason"]);
  return {
    ruleId: field.text(item.ruleId, 80),
    ruleRevision: field.integer(item.ruleRevision),
    slot,
    ...(completed
      ? {
          completed: {
            slot: field.integer(completed.slot, 0, slot),
            evaluatedAt: field.timestamp(completed.evaluatedAt),
            reason: field.choice(completed.reason, [
              "matched",
              "no_match",
              "source_unavailable",
              "inbox_full",
            ]),
          },
        }
      : {}),
  };
}

function unique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) throw invalidAttentionState();
}
