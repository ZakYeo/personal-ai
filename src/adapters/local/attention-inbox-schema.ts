import type {
  AttentionDeliveryState,
  AttentionInboxItem,
} from "../../ports/attention.js";
import { isSpokenTextSafe } from "../../application/human-text.js";
import { isRecord } from "../parsing.js";
import {
  attentionFields as field,
  invalidAttentionState,
} from "./attention-state-fields.js";
import { parseAttentionProvenance } from "./attention-rule-schema.js";

export function parseAttentionInboxItem(value: unknown): AttentionInboxItem {
  const item = field.record(value, [
    "id",
    "ruleId",
    "ruleName",
    "key",
    "text",
    "explanation",
    "timeZone",
    "facts",
    "provenance",
    "observedAt",
    "createdAt",
    "updatedAt",
    "revision",
    "status",
    "snoozedUntil",
    "delivery",
  ]);
  if (JSON.stringify(item).length > 12_000) throw invalidAttentionState();
  const parsed: AttentionInboxItem = {
    id: field.text(item.id, 80),
    ruleId: field.text(item.ruleId, 80),
    ruleName: field.text(item.ruleName, 80),
    key: field.text(item.key, 240),
    text: safeText(item.text),
    explanation: safeText(item.explanation),
    timeZone: field.timeZone(item.timeZone),
    facts: parseFacts(item.facts),
    provenance: parseAttentionProvenance(item.provenance),
    observedAt: field.timestamp(item.observedAt),
    createdAt: field.timestamp(item.createdAt),
    updatedAt: field.timestamp(item.updatedAt),
    revision: field.integer(item.revision),
    status: field.choice(item.status, ["open", "acknowledged", "dismissed"]),
    ...(item.snoozedUntil === undefined
      ? {}
      : { snoozedUntil: field.timestamp(item.snoozedUntil) }),
    delivery: parseDelivery(item.delivery),
  };
  if (
    parsed.observedAt < parsed.createdAt ||
    parsed.updatedAt < parsed.observedAt ||
    parsed.provenance.recordedAt > parsed.createdAt ||
    (parsed.delivery.status !== "not_sent" &&
      (parsed.delivery.attemptedAt < parsed.createdAt ||
        parsed.delivery.attemptedAt > parsed.updatedAt)) ||
    (parsed.delivery.status === "delivered" &&
      parsed.delivery.deliveredAt > parsed.updatedAt)
  )
    throw invalidAttentionState();
  return parsed;
}

function parseDelivery(value: unknown): AttentionDeliveryState {
  const item = field.record(value, [
    "status",
    "reason",
    "attemptedAt",
    "deliveredAt",
  ]);
  if (item.status === "not_sent") {
    field.record(item, ["status", "reason"]);
    return {
      status: item.status,
      reason: field.choice(item.reason, [
        "eligible",
        "disabled",
        "snoozed",
        "quiet_hours",
        "cooldown",
        "daily_budget",
        "duplicate",
        "invalid_clock",
        "output_unavailable",
      ]),
    };
  }
  if (item.status === "unknown") {
    field.record(item, ["status", "attemptedAt"]);
    return {
      status: item.status,
      attemptedAt: field.timestamp(item.attemptedAt),
    };
  }
  if (item.status === "delivered") {
    field.record(item, ["status", "attemptedAt", "deliveredAt"]);
    const attemptedAt = field.timestamp(item.attemptedAt);
    const deliveredAt = field.timestamp(item.deliveredAt);
    if (deliveredAt < attemptedAt) throw invalidAttentionState();
    return { status: item.status, attemptedAt, deliveredAt };
  }
  throw invalidAttentionState();
}

function safeText(value: unknown): string {
  const text = field.text(value);
  if (!isSpokenTextSafe(text)) throw invalidAttentionState();
  return text;
}

function parseFacts(value: unknown): AttentionInboxItem["facts"] {
  if (!isRecord(value) || Object.keys(value).length > 32)
    throw invalidAttentionState();
  const facts: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9]{0,63}$/u.test(key) ||
      ["constructor", "prototype"].includes(key)
    )
      throw invalidAttentionState();
    facts[key] =
      typeof entry === "string"
        ? field.text(entry, 256)
        : typeof entry === "boolean"
          ? entry
          : field.finite(entry);
  }
  return facts;
}
