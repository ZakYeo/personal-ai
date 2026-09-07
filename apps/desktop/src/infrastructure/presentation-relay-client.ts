import { parseRelayMessage } from "./presentation-relay-protocol.js";
import {
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
  readonly createClientId?: () => string;
  readonly directClient?: PresentationClient;
  readonly role: RelayRole;
}): PresentationClient {
  validateRole(options);
  const channel =
    options.channel ?? new BroadcastChannel("personal-ai-presentation-v1");
  const nextRequestId = createRequestIds(options.createClientId);
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
    sendControl(input) {
      const control = { ...input, requestId: nextRequestId() };
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

function createRequestIds(
  createClientId: () => string = () => crypto.randomUUID(),
) {
  const clientId = createClientId();
  let sequence = 0;
  return () => `${clientId}-${++sequence}`;
}
