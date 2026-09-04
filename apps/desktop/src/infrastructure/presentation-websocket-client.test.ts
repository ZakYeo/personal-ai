import { createPresentationWebSocketClient } from "./presentation-websocket-client.js";
import type { RuntimePresentationState } from "../model/desktop-state.js";

const token = "a-secure-presentation-token-with-32-characters";

function createFakeSocket() {
  const listeners = {
    close: [] as Array<() => void>,
    message: [] as Array<(event: MessageEvent<unknown>) => void>,
    open: [] as Array<() => void>,
  };
  const sent: string[] = [];
  const socket = {
    readyState: WebSocket.OPEN,
    addEventListener(
      type: "close" | "message" | "open",
      listener: (() => void) | ((event: MessageEvent<unknown>) => void),
    ) {
      if (type === "message") {
        listeners.message.push(listener);
      } else {
        listeners[type].push(listener as () => void);
      }
    },
    close: () => {
      for (const listener of listeners.close) listener();
    },
    send: (data: string) => sent.push(data),
  };
  return {
    emitMessage: (value: unknown) => {
      for (const listener of listeners.message) {
        listener(new MessageEvent("message", { data: JSON.stringify(value) }));
      }
    },
    open: () => {
      for (const listener of listeners.open) listener();
    },
    sent,
    socket,
  };
}

describe("presentation WebSocket client", () => {
  it("authenticates and reduces validated events", () => {
    const fake = createFakeSocket();
    const states: RuntimePresentationState[] = [];
    const client = createPresentationWebSocketClient({
      createSocket: () => fake.socket,
      endpoint: "ws://127.0.0.1:43210",
      scheduleReconnect: () => 1,
      token,
    });
    client.subscribe((state) => states.push(state));

    client.connect();
    fake.open();
    expect(fake.sent[0]).toBe(
      JSON.stringify({ protocolVersion: 1, token, type: "authenticate" }),
    );
    fake.emitMessage({
      protocolVersion: 1,
      snapshot: {
        instanceId: "service-1",
        microphone: "available",
        sequence: 0,
        wakeListening: false,
      },
      type: "snapshot",
    });
    fake.emitMessage({
      event: {
        occurredAt: "2026-09-04T10:00:00.000Z",
        sequence: 1,
        type: "wake_listening",
      },
      protocolVersion: 1,
      type: "event",
    });
    fake.emitMessage({
      projection: {
        activity: [],
        alarms: [],
        integrations: [],
        interactions: [],
        profile: [],
        sources: [],
        tasks: [{ id: "task-1", label: "Review", status: "open" }],
        today: ["Review"],
      },
      protocolVersion: 1,
      type: "projection",
    });

    expect(states.at(-1)?.connection).toBe("connected");
    expect(states.at(-1)?.snapshot).toMatchObject({
      sequence: 1,
      wakeListening: true,
    });
    expect(states.at(-1)?.projection?.tasks).toEqual([
      { id: "task-1", label: "Review", status: "open" },
    ]);
  });

  it("rejects non-loopback and credential-bearing endpoints", () => {
    expect(() =>
      createPresentationWebSocketClient({
        endpoint: "ws://example.com:43210",
        token,
      }),
    ).toThrow("loopback WebSocket");
    expect(() =>
      createPresentationWebSocketClient({
        endpoint: "ws://user:password@127.0.0.1:43210",
        token,
      }),
    ).toThrow("loopback WebSocket");
  });

  it("prevents duplicate sockets and cancels queued reconnect on shutdown", () => {
    const fake = createFakeSocket();
    const cancelReconnect = vi.fn();
    const createSocket = vi.fn(() => fake.socket);
    let reconnect: (() => void) | undefined;
    const client = createPresentationWebSocketClient({
      cancelReconnect,
      createSocket,
      endpoint: "ws://127.0.0.1:43210",
      scheduleReconnect: (callback) => {
        reconnect = callback;
        return 42;
      },
      token,
    });

    client.connect();
    client.connect();
    fake.socket.close();
    client.disconnect();
    reconnect?.();

    expect(createSocket).toHaveBeenCalledOnce();
    expect(cancelReconnect).toHaveBeenCalledWith(42);
  });
});
