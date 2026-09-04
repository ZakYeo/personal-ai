import {
  parsePresentationServerMessage,
  presentationProtocolVersion,
  reduceAssistantRuntimeEvent,
  type AssistantPresentationSnapshot,
  type AssistantPresentationProjection,
  type PresentationControl,
} from "../../../../src/presentation-contract.js";
import type { RuntimePresentationState } from "../model/desktop-state.js";
import type { PresentationClient } from "../ports/presentation-client.js";

interface BrowserSocket {
  readonly readyState: number;
  addEventListener(type: "close" | "open", listener: () => void): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  close(): void;
  send(data: string): void;
}

interface PresentationWebSocketClientOptions {
  readonly cancelReconnect?: (timer: number) => void;
  readonly createSocket?: (url: string) => BrowserSocket;
  readonly endpoint: string;
  readonly scheduleReconnect?: (callback: () => void, delay: number) => number;
  readonly token: string;
}

export function createPresentationWebSocketClient(
  options: PresentationWebSocketClientOptions,
): PresentationClient {
  validateConnectionOptions(options);
  const session = new PresentationWebSocketClient(options);
  const client: PresentationClient = {
    connect: () => session.connect(),
    disconnect: () => session.disconnect(),
    sendControl: (control) => session.sendControl(control),
    subscribe: (listener) => session.subscribe(listener),
  };
  return Object.freeze(client);
}

class PresentationWebSocketClient implements PresentationClient {
  private readonly cancelReconnect: (timer: number) => void;
  private readonly createSocket: (url: string) => BrowserSocket;
  private readonly listeners = new Set<
    (state: RuntimePresentationState) => void
  >();
  private readonly scheduleReconnect: (
    callback: () => void,
    delay: number,
  ) => number;
  private cursor: { instanceId: string; sequence: number } | undefined;
  private reconnectAttempt = 0;
  private reconnectTimer: number | undefined;
  private snapshot: AssistantPresentationSnapshot | undefined;
  private projection: AssistantPresentationProjection | undefined;
  private socket: BrowserSocket | undefined;
  private stopped = true;

  constructor(private readonly options: PresentationWebSocketClientOptions) {
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
    this.cancelReconnect = options.cancelReconnect ?? window.clearTimeout;
    this.scheduleReconnect = options.scheduleReconnect ?? window.setTimeout;
  }

  connect(): void {
    if (this.socket) return;
    this.clearReconnect();
    this.stopped = false;
    this.notify("connecting");
    this.socket = this.createSocket(this.options.endpoint);
    this.socket.addEventListener("open", this.authenticate);
    this.socket.addEventListener("message", this.receive);
    this.socket.addEventListener("close", this.disconnected);
  }

  disconnect(): void {
    this.stopped = true;
    this.clearReconnect();
    this.socket?.close();
    this.socket = undefined;
    this.notify("offline");
  }

  sendControl(control: PresentationControl): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Presentation service is offline."));
    }
    this.socket.send(
      JSON.stringify({
        ...control,
        protocolVersion: presentationProtocolVersion,
      }),
    );
    return Promise.resolve();
  }

  subscribe(listener: (state: RuntimePresentationState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private readonly authenticate = (): void => {
    this.socket?.send(
      JSON.stringify({
        ...(this.cursor ? { cursor: this.cursor } : {}),
        protocolVersion: presentationProtocolVersion,
        token: this.options.token,
        type: "authenticate",
      }),
    );
  };

  private readonly receive = (event: MessageEvent<unknown>): void => {
    const message = parsePresentationServerMessage(parseJson(event.data));
    if (!message) return this.failClosed();
    if (message.type === "snapshot") {
      this.snapshot = message.snapshot;
      this.cursor = {
        instanceId: message.snapshot.instanceId,
        sequence: message.snapshot.sequence,
      };
      this.reconnectAttempt = 0;
      this.notify("connected");
      return;
    }
    if (message.type === "event") this.applyEvent(message.event);
    if (message.type === "projection") {
      this.projection = message.projection;
      this.notify("connected");
    }
    if (message.type === "error" && message.code === "authentication_failed") {
      this.stopped = true;
      this.notify("authentication_failed");
      this.socket?.close();
    }
  };

  private applyEvent(
    event: Parameters<typeof reduceAssistantRuntimeEvent>[1],
  ): void {
    if (!this.snapshot) return this.failClosed();
    try {
      this.snapshot = reduceAssistantRuntimeEvent(this.snapshot, event);
      this.cursor = {
        instanceId: this.snapshot.instanceId,
        sequence: this.snapshot.sequence,
      };
      this.notify("connected");
    } catch {
      this.failClosed();
    }
  }

  private failClosed(): void {
    this.cursor = undefined;
    this.snapshot = undefined;
    this.socket?.close();
  }

  private readonly disconnected = (): void => {
    this.socket = undefined;
    if (this.stopped) return;
    this.notify("offline");
    this.reconnectAttempt += 1;
    const delay = Math.min(5_000, 250 * 2 ** this.reconnectAttempt);
    this.reconnectTimer = this.scheduleReconnect(() => {
      this.reconnectTimer = undefined;
      if (!this.stopped) this.connect();
    }, delay);
  };

  private clearReconnect(): void {
    if (this.reconnectTimer === undefined) return;
    this.cancelReconnect(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private notify(connection: RuntimePresentationState["connection"]): void {
    const state: RuntimePresentationState = {
      connection,
      ...(this.projection ? { projection: this.projection } : {}),
      ...(this.snapshot ? { snapshot: this.snapshot } : {}),
    };
    for (const listener of this.listeners) listener(state);
  }
}

function validateConnectionOptions(options: {
  endpoint: string;
  token: string;
}): void {
  const endpoint = new URL(options.endpoint);
  if (
    endpoint.protocol !== "ws:" ||
    endpoint.hostname !== "127.0.0.1" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== "/"
  ) {
    throw new Error("Presentation endpoint must be loopback WebSocket only.");
  }
  if (options.token.length < 32 || options.token.length > 512) {
    throw new Error("Presentation token must be 32 to 512 characters.");
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return;
  }
}
