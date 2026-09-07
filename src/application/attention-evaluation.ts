import { attentionEvictionIndex } from "./attention-capacity.js";
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
          ...rules.map(
            (rule): AttentionEvaluation => ({
              ruleId: rule.id,
              ruleRevision: rule.revision,
              slot,
              evaluatedAt: now.toISOString(),
              reason: "evaluating",
            }),
          ),
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
          evaluation.reason === "evaluating",
      )
    )
      return { result: [] };
    let nextId = state.nextId;
    const inbox = [...state.inbox];
    const matched: AttentionInboxItem[] = [];
    let full = false;
    for (const candidate of candidates) {
      const index = inbox.findIndex(
        (item) => item.ruleId === rule.id && item.key === candidate.key,
      );
      const previous = inbox[index];
      if (
        previous &&
        (previous.delivery.status !== "not_sent" || previous.status !== "open")
      )
        continue;
      if (!previous && inbox.length >= 256) {
        const eviction = attentionEvictionIndex(inbox, rule, state.rules);
        if (eviction < 0) {
          full = true;
          continue;
        }
        inbox.splice(eviction, 1);
      }
      const item: AttentionInboxItem = {
        ...previous,
        id: previous?.id ?? `attention-item-${nextId++}`,
        ruleId: rule.id,
        ruleName: rule.name,
        key: candidate.key,
        text: candidate.text,
        explanation: candidate.explanation,
        timeZone: candidate.timeZone,
        facts: candidate.facts,
        provenance: previous?.provenance ?? rule.provenance,
        createdAt: previous?.createdAt ?? now.toISOString(),
        updatedAt: now.toISOString(),
        revision: (previous?.revision ?? 0) + 1,
        status: "open",
        delivery: { status: "not_sent", reason: "eligible" },
      };
      if (previous) inbox[index] = item;
      else inbox.push(item);
      matched.push(item);
    }
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
            ? { ...evaluation, reason, evaluatedAt: now.toISOString() }
            : evaluation,
        ),
      },
    };
  });
}
