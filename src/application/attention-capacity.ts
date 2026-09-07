import type { AttentionInboxItem, AttentionRule } from "../ports/attention.js";
import { compareAttentionRules } from "./attention-policy.js";

/** Only an undelivered lower-priority notice may yield its bounded inbox slot. */
export function attentionEvictionIndex(
  inbox: readonly AttentionInboxItem[],
  incoming: AttentionRule,
  rules: readonly AttentionRule[],
): number {
  const eligible = inbox.flatMap((item, index) => {
    const rule = rules.find((rule) => rule.id === item.ruleId);
    return rule &&
      item.delivery.status === "not_sent" &&
      compareAttentionRules(incoming, rule) < 0
      ? [{ index, rule, item }]
      : [];
  });
  eligible.sort(
    (left, right) =>
      compareAttentionRules(right.rule, left.rule) ||
      left.item.createdAt.localeCompare(right.item.createdAt) ||
      left.item.id.localeCompare(right.item.id),
  );
  return eligible[0]?.index ?? -1;
}
