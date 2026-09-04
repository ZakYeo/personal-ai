import type {
  AssistantPresentationInteraction,
  AssistantPresentationPhase,
  AssistantPresentationResponse,
  AssistantPresentationSnapshot,
} from "../ports/presentation.js";
import {
  isResponseStatus,
  parsePresentationCitations,
} from "./presentation-event-parser.js";
import {
  hasOnlyKeys,
  isIdentifier,
  isNonNegativeInteger,
  isRecord,
  isSafePresentationText,
  isTimestamp,
  presentationTextLimits,
} from "./presentation-validation.js";

export function parsePresentationSnapshot(
  value: unknown,
): AssistantPresentationSnapshot | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "instanceId",
      "interaction",
      "microphone",
      "sequence",
      "wakeListening",
    ]) ||
    !isIdentifier(value.instanceId) ||
    !isMicrophoneState(value.microphone) ||
    !isNonNegativeInteger(value.sequence) ||
    typeof value.wakeListening !== "boolean"
  ) {
    return;
  }
  if (value.interaction === undefined) {
    return {
      instanceId: value.instanceId,
      microphone: value.microphone,
      sequence: value.sequence,
      wakeListening: value.wakeListening,
    };
  }
  const interaction = parseInteraction(value.interaction);
  return interaction
    ? {
        instanceId: value.instanceId,
        interaction,
        microphone: value.microphone,
        sequence: value.sequence,
        wakeListening: value.wakeListening,
      }
    : undefined;
}

function parseInteraction(
  value: unknown,
): AssistantPresentationInteraction | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "confirmation",
      "failure",
      "id",
      "phase",
      "response",
      "transcript",
      "updatedAt",
    ]) ||
    !isIdentifier(value.id) ||
    !isPresentationPhase(value.phase) ||
    !isSafePresentationText(
      value.transcript,
      presentationTextLimits.transcript,
      true,
    ) ||
    !isTimestamp(value.updatedAt)
  ) {
    return;
  }
  const confirmation = parseConfirmation(value.confirmation);
  const failure = parseFailure(value.failure);
  const response = parseResponse(value.response);
  if (
    (value.confirmation !== undefined && !confirmation) ||
    (value.failure !== undefined && !failure) ||
    (value.response !== undefined && !response)
  ) {
    return;
  }
  return {
    ...(confirmation ? { confirmation } : {}),
    ...(failure ? { failure } : {}),
    id: value.id,
    phase: value.phase,
    ...(response ? { response } : {}),
    transcript: value.transcript,
    updatedAt: value.updatedAt,
  };
}

function parseResponse(
  value: unknown,
): AssistantPresentationResponse | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["citations", "status", "text"]) ||
    !isResponseStatus(value.status) ||
    !isSafePresentationText(value.text, presentationTextLimits.text, true)
  ) {
    return;
  }
  const citations = parsePresentationCitations(value.citations);
  return citations
    ? { citations, status: value.status, text: value.text }
    : undefined;
}

function parseConfirmation(value: unknown) {
  return isRecord(value) &&
    hasOnlyKeys(value, ["prompt"]) &&
    isSafePresentationText(value.prompt, 1_000, true)
    ? { prompt: value.prompt }
    : undefined;
}

function parseFailure(value: unknown) {
  return isRecord(value) &&
    hasOnlyKeys(value, ["message"]) &&
    isSafePresentationText(value.message, presentationTextLimits.text, true)
    ? { message: value.message }
    : undefined;
}

function isMicrophoneState(
  value: unknown,
): value is "available" | "capturing" | "muted" | "unavailable" {
  return ["available", "capturing", "muted", "unavailable"].includes(
    String(value),
  );
}

function isPresentationPhase(
  value: unknown,
): value is AssistantPresentationPhase {
  return [
    "cancelled",
    "cancelling",
    "completed",
    "confirmation",
    "failed",
    "listening",
    "processing",
    "response",
    "speaking",
  ].includes(String(value));
}
