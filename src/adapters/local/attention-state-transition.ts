import type {
  AttentionInboxItem,
  AttentionRule,
  AttentionState,
} from "../../ports/attention.js";
import { invalidAttentionState } from "./attention-state-fields.js";

export function assertAttentionStateTransition(
  previous: AttentionState,
  next: AttentionState,
): void {
  if (next.revision !== previous.revision + 1 || next.nextId < previous.nextId)
    throw invalidAttentionState();
  assertRecordRevisions(previous.rules, next.rules);
  assertRecordRevisions(previous.inbox, next.inbox);
  for (const before of previous.inbox) {
    const after = next.inbox.find((item) => item.id === before.id);
    if (!after) continue;
    if (
      before.key !== after.key ||
      before.ruleId !== after.ruleId ||
      (before.status !== "open" && after.status === "open")
    )
      throw invalidAttentionState();
    if (before.delivery.status !== "not_sent") {
      if (
        after.delivery.status === "not_sent" ||
        after.delivery.attemptedAt !== before.delivery.attemptedAt
      )
        throw invalidAttentionState();
      if (
        before.delivery.status === "delivered" &&
        (after.delivery.status !== "delivered" ||
          after.delivery.deliveredAt !== before.delivery.deliveredAt)
      )
        throw invalidAttentionState();
    }
  }
}

function assertRecordRevisions<T extends AttentionRule | AttentionInboxItem>(
  previous: readonly T[],
  next: readonly T[],
): void {
  for (const before of previous) {
    const after = next.find((item) => item.id === before.id);
    if (!after || JSON.stringify(before) === JSON.stringify(after)) continue;
    if (
      after.revision !== before.revision + 1 ||
      after.createdAt !== before.createdAt ||
      after.updatedAt < before.updatedAt
    )
      throw invalidAttentionState();
  }
}
