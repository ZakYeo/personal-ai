import { createDefaultWebSocketFactory } from "./desktop-voice-adapter-registry.js";

const { MockWebSocket, mockWebSocketInstances } = vi.hoisted(() => {
  type MockWebSocketListener = (event?: unknown) => void;

  class HoistedMockWebSocket {
    closed = false;
    readonly listeners: Record<string, MockWebSocketListener[]> = {};
    readonly sentMessages: string[] = [];

    constructor(
      readonly url: string,
      readonly options: { headers: Record<string, string> },
    ) {
      mockInstances.push(this);
    }

    close(): void {
      this.closed = true;
    }

    emit(type: string, event?: unknown): void {
      for (const listener of this.listeners[type] ?? []) {
        listener(event);
      }
    }

    on(type: string, listener: MockWebSocketListener): void {
      this.listeners[type] = [...(this.listeners[type] ?? []), listener];
    }

    send(message: string): void {
      this.sentMessages.push(message);
    }
  }

  const mockInstances: HoistedMockWebSocket[] = [];

  return {
    MockWebSocket: HoistedMockWebSocket,
    mockWebSocketInstances: mockInstances,
  };
});

vi.mock("ws", () => ({
  default: MockWebSocket,
}));

describe("desktop voice adapter registry", () => {
  beforeEach(() => {
    mockWebSocketInstances.length = 0;
  });

  it("creates authenticated realtime sockets with the ws client", () => {
    const socket = createDefaultWebSocketFactory({
      apiKey: "test-api-key",
      url: "wss://api.openai.test/v1/realtime?intent=transcription",
    });
    const messages: unknown[] = [];

    socket.addEventListener("message", (event) => {
      messages.push(event);
    });
    socket.send("hello");
    mockWebSocketInstances[0]?.emit("message", Buffer.from("response"));
    socket.close();

    expect(mockWebSocketInstances).toHaveLength(1);
    expect(mockWebSocketInstances[0]).toEqual(
      expect.objectContaining({
        options: {
          headers: {
            Authorization: "Bearer test-api-key",
          },
        },
        sentMessages: ["hello"],
        url: "wss://api.openai.test/v1/realtime?intent=transcription",
      }),
    );
    expect(messages).toEqual([{ data: "response" }]);
    expect(mockWebSocketInstances[0]?.closed).toBe(true);
  });
});
