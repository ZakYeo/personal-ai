import type {
  AttentionCandidate,
  AttentionInboxItem,
  AttentionRule,
} from "../ports/attention.js";
import { humanizeSpokenText } from "./human-text.js";
import { containsControlCharacters } from "./text-safety.js";
import { isCanonicalTimeZoneIdentifier } from "./temporal-policy.js";
import { createOpaqueKey } from "./opaque-key.js";

export function prepareAttentionCandidate(
  candidate: AttentionCandidate,
  rule: AttentionRule,
  now: Date,
): Omit<AttentionCandidate, "presentation"> {
  if (
    typeof candidate.key !== "string" ||
    !candidate.key ||
    candidate.key.length > 512 ||
    !isCanonicalTimeZoneIdentifier(candidate.timeZone) ||
    Object.keys(candidate.facts).length > 32
  )
    throw new Error("Attention source returned invalid candidate metadata.");
  const facts: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(candidate.facts)) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9]{0,63}$/u.test(key) ||
      ["constructor", "prototype"].includes(key) ||
      (typeof value === "string" &&
        (!value.trim() ||
          value.length > 256 ||
          containsControlCharacters(value))) ||
      (typeof value === "number" && !Number.isFinite(value)) ||
      !["string", "number", "boolean"].includes(typeof value)
    )
      throw new Error("Attention source returned invalid bounded facts.");
    facts[key] = value;
  }
  const text = (value: string) => {
    if (typeof value !== "string" || !value.trim() || value.length > 4_000)
      throw new Error("Attention source returned invalid text.");
    const safe = humanizeSpokenText(value, {
      now,
      timeZone: candidate.timeZone,
      assistantTimeZone: rule.timeZone,
    });
    if (safe.length > 1_000 || containsControlCharacters(safe))
      throw new Error("Attention source exceeded its safe text bound.");
    return safe;
  };
  return {
    key: createOpaqueKey(
      "attention",
      JSON.stringify([rule.definition, candidate.key]),
    ),
    text: text(candidate.text),
    explanation: text(candidate.explanation),
    timeZone: candidate.timeZone,
    facts,
  };
}

export function attentionClaims(items: readonly AttentionInboxItem[]) {
  return items.flatMap((item) =>
    item.delivery.status === "not_sent"
      ? []
      : [
          {
            ruleId: item.ruleId,
            key: item.key,
            attemptedAt: item.delivery.attemptedAt,
          },
        ],
  );
}
