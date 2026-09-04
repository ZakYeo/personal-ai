import type {
  AssistantCitation,
  AssistantResponseStatus,
} from "../ports/assistant.js";
import type { AssistantRuntimeEvent } from "../ports/presentation.js";
import {
  hasOnlyKeys,
  isIdentifier,
  isRecord,
  isSafePresentationText,
  isTimestamp,
  presentationTextLimits,
} from "./presentation-validation.js";

const citationCount = 20;
const citationTitleCharacters = 300;
const confirmationCharacters = 1_000;
const urlCharacters = 2_048;

interface InteractionMetadata {
  readonly interactionId: string;
  readonly occurredAt: string;
  readonly sequence: number;
}

export function parseAssistantRuntimeEvent(
  value: unknown,
): AssistantRuntimeEvent | undefined {
  if (!hasEventMetadata(value)) return;
  const metadata = { occurredAt: value.occurredAt, sequence: value.sequence };
  if (value.type === "wake_listening") {
    return hasOnlyKeys(value, ["occurredAt", "sequence", "type"])
      ? { ...metadata, type: value.type }
      : undefined;
  }
  if (value.type === "microphone_changed") {
    return hasOnlyKeys(value, [
      "microphone",
      "occurredAt",
      "sequence",
      "type",
    ]) && isMicrophoneState(value.microphone)
      ? { ...metadata, microphone: value.microphone, type: value.type }
      : undefined;
  }
  if (!isIdentifier(value.interactionId)) return;
  return parseInteractionEvent(value, {
    ...metadata,
    interactionId: value.interactionId,
  });
}

export function parsePresentationCitations(
  value: unknown,
): readonly AssistantCitation[] | undefined {
  if (!Array.isArray(value) || value.length > citationCount) return;
  const citations: AssistantCitation[] = [];
  for (const citation of value) {
    if (
      !isRecord(citation) ||
      !hasOnlyKeys(citation, ["title", "url"]) ||
      !isSafePresentationText(citation.title, citationTitleCharacters, false) ||
      !isHttpsUrl(citation.url)
    ) {
      return;
    }
    citations.push({ title: citation.title, url: citation.url });
  }
  return citations;
}

export function isResponseStatus(
  value: unknown,
): value is AssistantResponseStatus {
  return [
    "error",
    "invalid",
    "needs_confirmation",
    "ok",
    "unknown",
    "unsupported",
  ].includes(String(value));
}

function parseInteractionEvent(
  value: Record<string, unknown> & { type: string },
  metadata: InteractionMetadata,
): AssistantRuntimeEvent | undefined {
  const simple = parseSimpleInteractionEvent(value, metadata);
  if (simple) return simple;
  if (
    value.type === "transcript_delta" &&
    hasOnlyKeys(value, [
      "delta",
      "interactionId",
      "occurredAt",
      "sequence",
      "type",
    ]) &&
    isSafePresentationText(value.delta, presentationTextLimits.transcript, true)
  ) {
    return { ...metadata, delta: value.delta, type: value.type };
  }
  if (
    value.type === "transcript_final" &&
    hasOnlyKeys(value, [
      "interactionId",
      "occurredAt",
      "sequence",
      "text",
      "type",
    ]) &&
    isSafePresentationText(value.text, presentationTextLimits.transcript, true)
  ) {
    return { ...metadata, text: value.text, type: value.type };
  }
  if (
    value.type === "confirmation_required" &&
    hasOnlyKeys(value, [
      "interactionId",
      "occurredAt",
      "prompt",
      "sequence",
      "type",
    ]) &&
    isSafePresentationText(value.prompt, confirmationCharacters, true)
  ) {
    return { ...metadata, prompt: value.prompt, type: value.type };
  }
  if (
    value.type === "safe_failure" &&
    hasOnlyKeys(value, [
      "interactionId",
      "message",
      "occurredAt",
      "sequence",
      "type",
    ]) &&
    isSafePresentationText(value.message, presentationTextLimits.text, true)
  ) {
    return { ...metadata, message: value.message, type: value.type };
  }
  return value.type === "response_ready"
    ? parseResponseEvent(value, metadata)
    : undefined;
}

function parseSimpleInteractionEvent(
  value: Record<string, unknown> & { type: string },
  metadata: InteractionMetadata,
): AssistantRuntimeEvent | undefined {
  if (
    !hasOnlyKeys(value, ["interactionId", "occurredAt", "sequence", "type"])
  ) {
    return;
  }
  switch (value.type) {
    case "cancelled":
    case "cancellation_requested":
    case "completed":
    case "follow_up_listening":
    case "processing":
    case "speaking_finished":
    case "speaking_started":
    case "wake_detected":
      return { ...metadata, type: value.type };
    default:
      return;
  }
}

function parseResponseEvent(
  value: Record<string, unknown>,
  metadata: InteractionMetadata,
): AssistantRuntimeEvent | undefined {
  if (
    !hasOnlyKeys(value, [
      "citations",
      "interactionId",
      "occurredAt",
      "sequence",
      "status",
      "text",
      "type",
    ]) ||
    !isResponseStatus(value.status) ||
    !isSafePresentationText(value.text, presentationTextLimits.text, true)
  ) {
    return;
  }
  const citations = parsePresentationCitations(value.citations);
  if (value.citations !== undefined && !citations) return;
  return {
    ...(citations ? { citations } : {}),
    ...metadata,
    status: value.status,
    text: value.text,
    type: "response_ready",
  };
}

function hasEventMetadata(value: unknown): value is Record<string, unknown> & {
  occurredAt: string;
  sequence: number;
  type: string;
} {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    isTimestamp(value.occurredAt) &&
    Number.isInteger(value.sequence) &&
    Number(value.sequence) > 0
  );
}

function isHttpsUrl(value: unknown): value is string {
  if (!isSafePresentationText(value, urlCharacters, false)) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isMicrophoneState(
  value: unknown,
): value is "available" | "capturing" | "muted" | "unavailable" {
  return ["available", "capturing", "muted", "unavailable"].includes(
    String(value),
  );
}
