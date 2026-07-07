import { OpenAIRealtimeTranscription } from "./openai-realtime-transcription.js";

describe("OpenAIRealtimeTranscription", () => {
  it("streams audio chunks and emits transcript deltas", async () => {
    const socket = new FakeRealtimeSocket();
    const deltas: string[] = [];
    const adapter = new OpenAIRealtimeTranscription({
      config: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "wss://api.openai.test/v1/realtime",
        model: "gpt-4o-transcribe",
      },
      env: { OPENAI_API_KEY: "test-key" },
      webSocketFactory: () => socket,
    });
    const transcriptPromise = adapter.transcribeStream(
      { chunks: chunksFromText("audio") },
      {
        onTranscriptDelta: (delta) => deltas.push(delta),
      },
    );

    socket.emitOpen();
    await socket.waitForSentType("input_audio_buffer.commit");
    socket.emitMessage({
      delta: "list ",
      type: "conversation.item.input_audio_transcription.delta",
    });
    socket.emitMessage({
      delta: "alarms",
      type: "conversation.item.input_audio_transcription.delta",
    });
    socket.emitMessage({
      transcript: "list alarms",
      type: "conversation.item.input_audio_transcription.completed",
    });

    await expect(transcriptPromise).resolves.toEqual({ text: "list alarms" });
    expect(deltas).toEqual(["list ", "alarms"]);
    expect(socket.sentMessages.map((message) => message.type)).toEqual([
      "input_audio_buffer.append",
      "input_audio_buffer.commit",
    ]);
  });

  it("rejects without an API key", async () => {
    const adapter = new OpenAIRealtimeTranscription({
      config: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "wss://api.openai.test/v1/realtime",
        model: "gpt-4o-transcribe",
      },
      env: {},
      webSocketFactory: () => new FakeRealtimeSocket(),
    });

    await expect(
      adapter.transcribeStream({ chunks: chunksFromText("audio") }),
    ).rejects.toThrow(
      "OpenAI API key environment variable OPENAI_API_KEY is not set.",
    );
  });
});

class FakeRealtimeSocket {
  readonly sentMessages: Array<Record<string, unknown>> = [];
  private readonly listeners: Record<string, Array<(event?: unknown) => void>> =
    {};

  addEventListener(type: string, listener: (event?: unknown) => void): void {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
  }

  close(): void {}

  send(message: string): void {
    this.sentMessages.push(JSON.parse(message) as Record<string, unknown>);
  }

  emitOpen(): void {
    this.emit("open");
  }

  emitMessage(message: Record<string, unknown>): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  async waitForSentType(type: string): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (this.sentMessages.some((message) => message.type === type)) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    throw new Error(`Timed out waiting for sent message ${type}.`);
  }

  private emit(type: string, event?: unknown): void {
    for (const listener of this.listeners[type] ?? []) {
      listener(event);
    }
  }
}

async function* chunksFromText(text: string): AsyncIterable<Uint8Array> {
  await Promise.resolve();
  yield Buffer.from(text, "utf8");
}
