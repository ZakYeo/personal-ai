import {
  presentationProtocolVersion,
  parsePresentationControl,
  parsePresentationServerMessage,
  type PresentationControl,
  type PresentationControlResult,
} from "../../../../src/presentation-contract.js";
import type { RuntimePresentationState } from "../model/desktop-state.js";

type RelayMessage =
  | { readonly type: "request_state" }
  | { readonly control: PresentationControl; readonly type: "control" }
  | {
      readonly requestId: string;
      readonly result: PresentationControlResult;
      readonly type: "control_result";
    }
  | { readonly state: RuntimePresentationState; readonly type: "state" };

export function parseRelayMessage(value: unknown): RelayMessage | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return;
  if (value.type === "request_state") return parseStateRequest(value);
  if (value.type === "control") return parseControlMessage(value);
  if (value.type === "control_result") return parseControlResultMessage(value);
  if (value.type === "state") return parseStateMessage(value);
  return;
}

function parseControlResultMessage(
  value: Record<string, unknown>,
): RelayMessage | undefined {
  if (!hasExactKeys(value, ["requestId", "result", "type"])) return;
  if (typeof value.requestId !== "string" || !isRecord(value.result)) return;
  const parsed = parsePresentationServerMessage({
    ...value.result,
    protocolVersion: presentationProtocolVersion,
    requestId: value.requestId,
    type: "control_result",
  });
  return parsed?.type === "control_result"
    ? {
        requestId: parsed.requestId,
        result: {
          ...(parsed.message ? { message: parsed.message } : {}),
          status: parsed.status,
        },
        type: "control_result",
      }
    : undefined;
}

function parseStateRequest(
  value: Record<string, unknown>,
): RelayMessage | undefined {
  return hasExactKeys(value, ["type"]) ? { type: "request_state" } : undefined;
}

function parseControlMessage(
  value: Record<string, unknown>,
): RelayMessage | undefined {
  if (!hasExactKeys(value, ["control", "type"])) return;
  const control = parsePresentationControl(value.control);
  return control ? { control, type: "control" } : undefined;
}

function parseStateMessage(
  value: Record<string, unknown>,
): RelayMessage | undefined {
  if (!hasExactKeys(value, ["state", "type"])) return;
  const state = parseRelayState(value.state);
  return state ? { state, type: "state" } : undefined;
}

function parseRelayState(value: unknown): RuntimePresentationState | undefined {
  if (!isRelayStateRecord(value)) return;
  if (!isConnectionState(value.connection)) return;
  const snapshot = parseSnapshot(value.snapshot);
  const projection = parseProjection(value.projection);
  if (value.snapshot !== undefined && !snapshot) return;
  if (value.projection !== undefined && !projection) return;
  return {
    connection: value.connection,
    ...(projection ? { projection } : {}),
    ...(snapshot ? { snapshot } : {}),
  };
}

function isRelayStateRecord(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    hasAllowedStateKeys(value) &&
    Object.hasOwn(value, "connection")
  );
}

function parseSnapshot(value: unknown) {
  if (value === undefined) return;
  const message = parsePresentationServerMessage({
    protocolVersion: presentationProtocolVersion,
    snapshot: value,
    type: "snapshot",
  });
  return message?.type === "snapshot" ? message.snapshot : undefined;
}

function parseProjection(value: unknown) {
  if (value === undefined) return;
  const message = parsePresentationServerMessage({
    projection: value,
    protocolVersion: presentationProtocolVersion,
    type: "projection",
  });
  return message?.type === "projection" ? message.projection : undefined;
}

function hasAllowedStateKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).every((key) =>
    ["connection", "projection", "snapshot"].includes(key),
  );
}

function isConnectionState(
  value: unknown,
): value is RuntimePresentationState["connection"] {
  return [
    "authentication_failed",
    "connected",
    "connecting",
    "offline",
  ].includes(typeof value === "string" ? value : "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const allowed = [...keys].sort();
  return (
    actual.length === allowed.length &&
    actual.every((key, index) => key === allowed[index])
  );
}
