import type { PresentationAttentionItem } from "../ports/presentation.js";
import {
  hasOnlyKeys,
  isIdentifier,
  isRecord,
  isSafePresentationText,
} from "./presentation-validation.js";
import { isSpokenTextSafe } from "./human-text.js";

export function parsePresentationAttentionItem(
  value: unknown,
): PresentationAttentionItem | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "revision",
      "title",
      "text",
      "explanation",
      "provenance",
      "recordedAt",
      "status",
      "delivery",
      "canResolveReminder",
    ]) ||
    !isIdentifier(value.id) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !text(value.title) ||
    !text(value.text) ||
    !text(value.explanation) ||
    !text(value.provenance) ||
    !text(value.recordedAt) ||
    !text(value.status) ||
    !text(value.delivery) ||
    typeof value.canResolveReminder !== "boolean"
  )
    return;
  return Object.freeze({
    id: value.id,
    revision: value.revision,
    title: value.title,
    text: value.text,
    explanation: value.explanation,
    provenance: value.provenance,
    recordedAt: value.recordedAt,
    status: value.status,
    delivery: value.delivery,
    canResolveReminder: value.canResolveReminder,
  });
}
function text(value: unknown): value is string {
  return isSafePresentationText(value, 1_000, false) && isSpokenTextSafe(value);
}
