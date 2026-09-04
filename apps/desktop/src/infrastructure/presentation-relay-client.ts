import {
  parsePresentationControl,
  parsePresentationServerMessage,
  presentationProtocolVersion,
  type PresentationControl,
  type PresentationControlResult,
} from "../../../../src/presentation-contract.js";
import type { RuntimePresentationState } from "../model/desktop-state.js";
import type { PresentationClient } from "../ports/presentation-client.js";

interface PresentationRelayChannel {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  close(): void;
  postMessage(message: unknown): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
}

type RelayRole = "leader" | "satellite";

export function createPresentationRelayClient(options: {
  readonly channel?: PresentationRelayChannel;
  readonly directClient?: PresentationClient;
  readonly role: RelayRole;
}): PresentationClient {
  validateRole(options);
  const channel =
    options.channel ?? new BroadcastChannel("personal-ai-presentation-v1");
  const listeners = new Set<(state: RuntimePresentationState) => void>();
  const pendingControls = new Map<
    string,
    {
      readonly reject: (error: Error) => void;
      readonly resolve: (result: PresentationControlResult) => void;
      readonly timer: number;
    }
  >();
  let currentState: RuntimePresentationState | undefined;
  let directUnsubscribe: (() => void) | undefined;
  let connected = false;

  function publish(state: RuntimePresentationState): void {
    currentState = state;
    for (const listener of listeners) listener(state);
  }

  function receive(event: MessageEvent<unknown>): void {
    const message = parseRelayMessage(event.data);
    if (!message) return;
    if (message.type === "state") {
      if (options.role === "satellite") publish(message.state);
      return;
    }
    if (message.type === "request_state") {
      if (options.role === "leader" && currentState)
        channel.postMessage({ state: currentState, type: "state" });
      return;
    }
    if (message.type === "control") {
      if (options.role === "leader")
        void forwardRelayControl(
          channel,
          options.directClient,
          message.control,
        );
      return;
    }
    if (options.role === "satellite")
      completeControl(message.requestId, message.result);
  }

  const client: PresentationClient = {
    connect() {
      if (connected) return;
      connected = true;
      channel.addEventListener("message", receive);
      if (options.role === "leader" && options.directClient) {
        directUnsubscribe = options.directClient.subscribe((state) => {
          publish(state);
          channel.postMessage({ state, type: "state" });
        });
        options.directClient.connect();
      } else {
        channel.postMessage({ type: "request_state" });
      }
    },
    disconnect() {
      if (!connected) return;
      connected = false;
      directUnsubscribe?.();
      options.directClient?.disconnect();
      rejectPendingControls();
      channel.removeEventListener("message", receive);
      channel.close();
    },
    sendControl(control) {
      if (options.role === "leader" && options.directClient) {
        return options.directClient.sendControl(control);
      }
      return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
          pendingControls.delete(control.requestId);
          reject(new Error("Presentation relay response timed out."));
        }, 5_000);
        pendingControls.set(control.requestId, { reject, resolve, timer });
        channel.postMessage({
          control: {
            ...control,
            protocolVersion: presentationProtocolVersion,
          },
          type: "control",
        });
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      if (currentState) listener(currentState);
      return () => listeners.delete(listener);
    },
  };
  return Object.freeze(client);

  function completeControl(
    requestId: string,
    result: PresentationControlResult,
  ): void {
    const pending = pendingControls.get(requestId);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingControls.delete(requestId);
    pending.resolve(result);
  }

  function rejectPendingControls(): void {
    for (const pending of pendingControls.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error("Presentation relay disconnected."));
    }
    pendingControls.clear();
  }
}

async function forwardRelayControl(
  channel: PresentationRelayChannel,
  directClient: PresentationClient | undefined,
  control: PresentationControl,
): Promise<void> {
  let result: PresentationControlResult;
  try {
    result = directClient
      ? await directClient.sendControl(control)
      : { message: "Presentation service is offline.", status: "rejected" };
  } catch {
    result = {
      message: "The presentation service could not accept that request.",
      status: "rejected",
    };
  }
  channel.postMessage({
    requestId: control.requestId,
    result,
    type: "control_result",
  });
}

type RelayMessage =
  | { readonly type: "request_state" }
  | { readonly control: PresentationControl; readonly type: "control" }
  | {
      readonly requestId: string;
      readonly result: PresentationControlResult;
      readonly type: "control_result";
    }
  | { readonly state: RuntimePresentationState; readonly type: "state" };

function parseRelayMessage(value: unknown): RelayMessage | undefined {
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

function validateRole(options: {
  directClient?: PresentationClient;
  role: RelayRole;
}): void {
  if (options.role === "leader" && !options.directClient) {
    throw new Error("Presentation relay leader requires a direct client.");
  }
  if (options.role === "satellite" && options.directClient) {
    throw new Error("Presentation relay satellite cannot own a direct client.");
  }
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
