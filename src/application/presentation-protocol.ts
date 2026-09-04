import {
  presentationProtocolVersion,
  type PresentationControl,
  type PresentationServerMessage,
} from "../ports/presentation.js";
import { parseAssistantRuntimeEvent } from "./presentation-event-parser.js";
import { parseAssistantPresentationProjection } from "./presentation-projection.js";
import { parsePresentationSnapshot } from "./presentation-snapshot-parser.js";
import {
  hasOnlyKeys,
  isIdentifier,
  isNonNegativeInteger,
  isRecord,
  isSafePresentationText,
  presentationTextLimits,
} from "./presentation-validation.js";

interface PresentationAuthentication {
  readonly cursor?: { readonly instanceId: string; readonly sequence: number };
  readonly token: string;
}

export function parsePresentationAuthentication(
  value: unknown,
): PresentationAuthentication | undefined {
  if (
    !isRecord(value) ||
    value.protocolVersion !== presentationProtocolVersion ||
    value.type !== "authenticate" ||
    typeof value.token !== "string" ||
    !hasOnlyKeys(value, ["cursor", "protocolVersion", "token", "type"])
  ) {
    return;
  }
  if (value.cursor === undefined) return { token: value.token };
  const cursor = parseCursor(value.cursor);
  return cursor ? { cursor, token: value.token } : undefined;
}

export function parsePresentationControl(
  value: unknown,
): PresentationControl | undefined {
  if (
    !isRecord(value) ||
    value.protocolVersion !== presentationProtocolVersion ||
    !isIdentifier(value.requestId) ||
    typeof value.type !== "string"
  ) {
    return;
  }
  if (value.type === "submit_text") {
    return hasOnlyKeys(value, [
      "protocolVersion",
      "requestId",
      "text",
      "type",
    ]) &&
      isSafePresentationText(value.text, presentationTextLimits.request, false)
      ? { requestId: value.requestId, text: value.text, type: value.type }
      : undefined;
  }
  if (value.type === "confirm" || value.type === "decline") {
    return hasOnlyKeys(value, [
      "interactionId",
      "protocolVersion",
      "requestId",
      "type",
    ]) && isIdentifier(value.interactionId)
      ? {
          interactionId: value.interactionId,
          requestId: value.requestId,
          type: value.type,
        }
      : undefined;
  }
  if (value.type === "dismiss_overlay" || value.type === "stop_listening") {
    return hasOnlyKeys(value, ["protocolVersion", "requestId", "type"])
      ? { requestId: value.requestId, type: value.type }
      : undefined;
  }
  if (value.type === "profile_explain") {
    return hasOnlyKeys(value, [
      "field",
      "protocolVersion",
      "requestId",
      "type",
    ]) && isIdentifier(value.field)
      ? { field: value.field, requestId: value.requestId, type: value.type }
      : undefined;
  }
  if (value.type === "profile_forget") {
    return hasOnlyKeys(value, [
      "field",
      "protocolVersion",
      "requestId",
      "type",
      "value",
    ]) &&
      isIdentifier(value.field) &&
      (value.value === undefined ||
        isSafePresentationText(value.value, 1_000, false))
      ? {
          field: value.field,
          requestId: value.requestId,
          ...(typeof value.value === "string" ? { value: value.value } : {}),
          type: value.type,
        }
      : undefined;
  }
  if (value.type === "profile_set") {
    return hasOnlyKeys(value, [
      "field",
      "protocolVersion",
      "requestId",
      "type",
      "value",
    ]) &&
      isIdentifier(value.field) &&
      isSafePresentationText(value.value, 1_000, false)
      ? {
          field: value.field,
          requestId: value.requestId,
          type: value.type,
          value: value.value,
        }
      : undefined;
  }
  return;
}

export function parsePresentationServerMessage(
  value: unknown,
): PresentationServerMessage | undefined {
  if (
    !isRecord(value) ||
    value.protocolVersion !== presentationProtocolVersion ||
    typeof value.type !== "string"
  ) {
    return;
  }
  if (value.type === "snapshot") {
    const snapshot = parsePresentationSnapshot(value.snapshot);
    return snapshot &&
      hasOnlyKeys(value, ["protocolVersion", "snapshot", "type"])
      ? {
          protocolVersion: presentationProtocolVersion,
          snapshot,
          type: "snapshot",
        }
      : undefined;
  }
  if (value.type === "projection") {
    const projection = parseAssistantPresentationProjection(value.projection);
    return projection &&
      hasOnlyKeys(value, ["projection", "protocolVersion", "type"])
      ? {
          projection,
          protocolVersion: presentationProtocolVersion,
          type: "projection",
        }
      : undefined;
  }
  if (value.type === "event") {
    const event = parseAssistantRuntimeEvent(value.event);
    return event && hasOnlyKeys(value, ["event", "protocolVersion", "type"])
      ? { event, protocolVersion: presentationProtocolVersion, type: "event" }
      : undefined;
  }
  if (value.type === "control_result") return parseControlResult(value);
  if (value.type === "error") return parseErrorMessage(value);
  return;
}

function parseControlResult(
  value: Record<string, unknown>,
): PresentationServerMessage | undefined {
  if (
    !hasOnlyKeys(value, [
      "message",
      "protocolVersion",
      "requestId",
      "status",
      "type",
    ]) ||
    !isIdentifier(value.requestId) ||
    (value.message !== undefined &&
      !isSafePresentationText(value.message, presentationTextLimits.text, true))
  ) {
    return;
  }
  const status = value.status;
  if (status !== "accepted" && status !== "busy" && status !== "rejected") {
    return;
  }
  return {
    ...(typeof value.message === "string" ? { message: value.message } : {}),
    protocolVersion: presentationProtocolVersion,
    requestId: value.requestId,
    status,
    type: "control_result",
  };
}

function parseErrorMessage(
  value: Record<string, unknown>,
): PresentationServerMessage | undefined {
  return hasOnlyKeys(value, ["code", "message", "protocolVersion", "type"]) &&
    isIdentifier(value.code) &&
    isSafePresentationText(value.message, presentationTextLimits.text, true)
    ? {
        code: value.code,
        message: value.message,
        protocolVersion: presentationProtocolVersion,
        type: "error",
      }
    : undefined;
}

function parseCursor(value: unknown) {
  return isRecord(value) &&
    hasOnlyKeys(value, ["instanceId", "sequence"]) &&
    isIdentifier(value.instanceId) &&
    isNonNegativeInteger(value.sequence)
    ? { instanceId: value.instanceId, sequence: value.sequence }
    : undefined;
}
