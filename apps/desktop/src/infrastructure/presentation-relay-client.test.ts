import type { PresentationControl } from "../../../../src/presentation-contract.js";
import type { RuntimePresentationState } from "../model/desktop-state.js";
import type { PresentationClient } from "../ports/presentation-client.js";
import { createPresentationRelayClient } from "./presentation-relay-client.js";

describe("presentation relay client", () => {
  it("keeps one direct service client and relays safe state to satellites", async () => {
    const channel = createFakeChannelPair();
    const direct = createDirectClient();
    const leader = createPresentationRelayClient({
      channel: channel.first,
      directClient: direct.client,
      role: "leader",
    });
    const satellite = createPresentationRelayClient({
      channel: channel.second,
      role: "satellite",
    });
    const satelliteStates: RuntimePresentationState[] = [];
    satellite.subscribe((state) => satelliteStates.push(state));

    leader.connect();
    satellite.connect();
    direct.publish({ connection: "connected", snapshot: snapshot() });
    await satellite.sendControl({
      interactionId: "interaction-1",
      requestId: "request-1",
      type: "confirm",
    });

    expect(direct.connect).toHaveBeenCalledOnce();
    expect(satelliteStates.at(-1)).toEqual({
      connection: "connected",
      snapshot: snapshot(),
    });
    expect(direct.controls).toEqual([
      {
        interactionId: "interaction-1",
        requestId: "request-1",
        type: "confirm",
      },
    ]);
  });

  it("rejects malformed relay messages without forwarding controls", () => {
    const channel = createFakeChannelPair();
    const direct = createDirectClient();
    const leader = createPresentationRelayClient({
      channel: channel.first,
      directClient: direct.client,
      role: "leader",
    });
    leader.connect();

    channel.second.postMessage({
      control: {
        protocolVersion: 1,
        requestId: "request-1",
        text: "Hello",
        type: "submit_text",
        unexpected: "private",
      },
      type: "control",
    });

    expect(direct.controls).toEqual([]);
  });
});

function createDirectClient() {
  const controls: PresentationControl[] = [];
  const listeners = new Set<(state: RuntimePresentationState) => void>();
  const connect = vi.fn();
  const client: PresentationClient = {
    connect,
    disconnect: vi.fn(),
    sendControl: (control) => {
      controls.push(control);
      return Promise.resolve({ status: "accepted" as const });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    client,
    connect,
    controls,
    publish: (state: RuntimePresentationState) => {
      for (const listener of listeners) listener(state);
    },
  };
}

function createFakeChannelPair() {
  const firstListeners = new Set<(event: MessageEvent<unknown>) => void>();
  const secondListeners = new Set<(event: MessageEvent<unknown>) => void>();
  return {
    first: createFakeChannel(firstListeners, secondListeners),
    second: createFakeChannel(secondListeners, firstListeners),
  };
}

function createFakeChannel(
  own: Set<(event: MessageEvent<unknown>) => void>,
  peer: Set<(event: MessageEvent<unknown>) => void>,
) {
  return {
    addEventListener: (
      _type: "message",
      listener: (event: MessageEvent<unknown>) => void,
    ) => {
      own.add(listener);
    },
    close: vi.fn(),
    postMessage: (message: unknown) => {
      for (const listener of peer)
        listener(new MessageEvent("message", { data: message }));
    },
    removeEventListener: (
      _type: "message",
      listener: (event: MessageEvent<unknown>) => void,
    ) => {
      own.delete(listener);
    },
  };
}

function snapshot() {
  return {
    instanceId: "service-1",
    interaction: {
      confirmation: { prompt: "Approve?" },
      id: "interaction-1",
      phase: "confirmation" as const,
      transcript: "do it",
      updatedAt: "2026-09-04T10:00:00.000Z",
    },
    microphone: "available" as const,
    sequence: 4,
    wakeListening: false,
  };
}
