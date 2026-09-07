import { reconcileAttentionCandidates } from "./attention-inbox-reconciliation.js";
import type {
  AttentionCandidate,
  AttentionEvaluation,
  AttentionInboxItem,
  AttentionRule,
  AttentionStore,
} from "../ports/attention.js";
import { updateAttentionState } from "./attention-transaction.js";

export async function claimAttentionEvaluations(
  store: AttentionStore,
  now: Date,
): Promise<AttentionRule[]> {
  const slot = Math.floor(now.getTime() / 60_000);
  return updateAttentionState(store, (state) => {
    const rules = state.rules.filter(
      (rule) =>
        rule.enabled &&
        (!rule.snoozedUntil || rule.snoozedUntil <= now.toISOString()) &&
        !state.evaluations.some(
          (evaluation) =>
            evaluation.ruleId === rule.id &&
            evaluation.ruleRevision === rule.revision &&
            evaluation.slot >= slot,
        ),
    );
    if (!rules.length) return { result: [] };
    const evaluations = state.evaluations.filter(
      (evaluation) => !rules.some((rule) => rule.id === evaluation.ruleId),
    );
    return {
      result: rules,
      state: {
        ...state,
        evaluations: [
          ...evaluations,
          ...rules.map((rule): AttentionEvaluation => {
            const completed = state.evaluations.find(
              (entry) =>
                entry.ruleId === rule.id &&
                entry.ruleRevision === rule.revision,
            )?.completed;
            return {
              ruleId: rule.id,
              ruleRevision: rule.revision,
              slot,
              ...(completed ? { completed } : {}),
            };
          }),
        ],
      },
    };
  });
}

export async function saveAttentionCandidates(
  store: AttentionStore,
  rule: AttentionRule,
  candidates: readonly AttentionCandidate[],
  now: Date,
  hasOutput: boolean,
  failed = false,
): Promise<AttentionInboxItem[]> {
  return updateAttentionState(store, (state) => {
    if (
      !state.rules.some(
        (current) =>
          current.id === rule.id && current.revision === rule.revision,
      )
    )
      return { result: [] };
    if (
      !state.evaluations.some(
        (evaluation) =>
          evaluation.ruleId === rule.id &&
          evaluation.ruleRevision === rule.revision &&
          evaluation.slot === Math.floor(now.getTime() / 60_000) &&
          evaluation.completed?.slot !== evaluation.slot,
      )
    )
      return { result: [] };
    const { inbox, nextId, matched, full } = reconcileAttentionCandidates(
      state,
      rule,
      candidates,
      now,
      hasOutput,
    );
    const reason = failed
      ? "source_unavailable"
      : full
        ? "inbox_full"
        : candidates.length
          ? "matched"
          : "no_match";
    return {
      result: matched,
      state: {
        ...state,
        nextId,
        inbox,
        evaluations: state.evaluations.map((evaluation) =>
          evaluation.ruleId === rule.id
            ? {
                ...evaluation,
                completed: {
                  slot: evaluation.slot,
                  reason,
                  evaluatedAt: now.toISOString(),
                },
              }
            : evaluation,
        ),
      },
    };
  });
}
