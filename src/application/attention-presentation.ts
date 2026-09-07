import type { AttentionInboxItem } from "../ports/attention.js";
import { renderSpokenFact } from "./human-text.js";

/** Attribute all snapshot wording, including source-authored relative phrases, to its capture instant. */
export function renderAttentionHistory(
  item: AttentionInboxItem,
  bodyLimit = 800,
): string {
  const recorded = renderSpokenFact(item.observedAt, {
    now: new Date(item.observedAt),
    timeZone: item.timeZone,
    assistantTimeZone: item.timeZone,
    dateStyle: "absolute",
  });
  const body =
    item.text.length <= bodyLimit
      ? item.text
      : `${item.text.slice(0, bodyLimit - 1).trimEnd()}…`;
  return `Recorded at ${recorded}: ${body}`;
}
