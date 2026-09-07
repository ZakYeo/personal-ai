import type {
  AttentionInboxItem,
  AttentionRule,
  AttentionStore,
} from "../ports/attention.js";
import { attentionClaims } from "./attention-candidate.js";
import { attentionDeliveryDecision } from "./attention-policy.js";
import { updateAttentionState } from "./attention-transaction.js";

export async function claimAttentionDelivery(
  store: AttentionStore,
  selected: AttentionInboxItem,
  rule: AttentionRule,
  now: Date,
  hasOutput: boolean,
): Promise<AttentionInboxItem | undefined> {
  return updateAttentionState(store, (state) => {
    const currentRule = state.rules.find(
      (current) => current.id === rule.id && current.revision === rule.revision,
    );
    const item = state.inbox.find(
      (current) =>
        current.id === selected.id && current.revision === selected.revision,
    );
    if (
      !currentRule ||
      !item ||
      item.status !== "open" ||
      item.delivery.status !== "not_sent"
    )
      return { result: undefined };
    const reason =
      item.snoozedUntil && item.snoozedUntil > now.toISOString()
        ? "snoozed"
        : attentionDeliveryDecision({
            rule: currentRule,
            key: item.key,
            now,
            claims: attentionClaims(state.inbox),
            preferences: state.preferences,
          });
    const claimed = reason === "eligible" && hasOutput;
    const updated: AttentionInboxItem = {
      ...item,
      revision: item.revision + 1,
      updatedAt: now.toISOString(),
      delivery: claimed
        ? { status: "unknown", attemptedAt: now.toISOString() }
        : {
            status: "not_sent",
            reason: reason === "eligible" ? "output_unavailable" : reason,
          },
    };
    return {
      result: claimed ? updated : undefined,
      state: {
        ...state,
        inbox: state.inbox.map((current) =>
          current.id === item.id ? updated : current,
        ),
      },
    };
  });
}

export async function completeAttentionDelivery(
  store: AttentionStore,
  claimed: AttentionInboxItem,
  now: Date,
): Promise<void> {
  await updateAttentionState(store, (state) => {
    const item = state.inbox.find((current) => current.id === claimed.id);
    if (!item || item.delivery.status !== "unknown")
      return { result: undefined };
    const updated: AttentionInboxItem = {
      ...item,
      revision: item.revision + 1,
      updatedAt: now.toISOString(),
      delivery: {
        status: "delivered",
        attemptedAt: item.delivery.attemptedAt,
        deliveredAt: now.toISOString(),
      },
    };
    return {
      result: undefined,
      state: {
        ...state,
        inbox: state.inbox.map((current) =>
          current.id === item.id ? updated : current,
        ),
      },
    };
  });
}
