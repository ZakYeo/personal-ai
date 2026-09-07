import type {
  AttentionCandidate,
  AttentionInboxItem,
  AttentionRule,
  AttentionState,
} from "../ports/attention.js";
import { attentionEvictionIndex } from "./attention-capacity.js";
import { attentionClaims } from "./attention-candidate.js";
import { attentionDeliveryDecision } from "./attention-policy.js";

export function attentionSuppressionReason(
  state: AttentionState,
  rule: AttentionRule,
  item: Pick<AttentionInboxItem, "key" | "snoozedUntil">,
  now: Date,
  hasOutput: boolean,
) {
  const reason =
    item.snoozedUntil && item.snoozedUntil > now.toISOString()
      ? "snoozed"
      : attentionDeliveryDecision({
          rule,
          key: item.key,
          now,
          claims: attentionClaims(state.inbox),
          preferences: state.preferences,
        });
  return reason === "eligible" && !hasOutput ? "output_unavailable" : reason;
}

/** Reconcile each fresh snapshot and its suppression policy once; unchanged notices retain their control revision. */
export function reconcileAttentionCandidates(
  state: AttentionState,
  rule: AttentionRule,
  candidates: readonly AttentionCandidate[],
  now: Date,
  hasOutput: boolean,
) {
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
    const reason = attentionSuppressionReason(
      state,
      rule,
      {
        key: candidate.key,
        ...(previous?.snoozedUntil
          ? { snoozedUntil: previous.snoozedUntil }
          : {}),
      },
      now,
      hasOutput,
    );
    const same =
      previous &&
      sameSnapshot(previous, candidate) &&
      previous.ruleName === rule.name;
    const item: AttentionInboxItem =
      same &&
      previous.delivery.status === "not_sent" &&
      previous.delivery.reason === reason
        ? previous
        : {
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
            observedAt: same ? previous.observedAt : now.toISOString(),
            createdAt: previous?.createdAt ?? now.toISOString(),
            updatedAt: now.toISOString(),
            revision: (previous?.revision ?? 0) + 1,
            status: "open",
            delivery: { status: "not_sent", reason },
          };
    if (previous) inbox[index] = item;
    else inbox.push(item);
    if (reason === "eligible") matched.push(item);
  }
  return { inbox, nextId, matched, full };
}

function sameSnapshot(
  previous: AttentionInboxItem,
  candidate: AttentionCandidate,
): boolean {
  return (
    previous.text === candidate.text &&
    previous.explanation === candidate.explanation &&
    previous.timeZone === candidate.timeZone &&
    Object.keys(previous.facts).length ===
      Object.keys(candidate.facts).length &&
    Object.entries(candidate.facts).every(
      ([key, value]) => previous.facts[key] === value,
    )
  );
}
