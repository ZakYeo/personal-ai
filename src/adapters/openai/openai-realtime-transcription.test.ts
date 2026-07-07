import { OpenAIRealtimeTranscription } from "./openai-realtime-transcription.js";

describe("OpenAIRealtimeTranscription", () => {
  it("streams audio chunks and emits transcript deltas", async () => {
    const socket = new FakeRealtimeSocket();
    const deltas: string[] = [];
    const adapter = new OpenAIRealtimeTranscription({
      config: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "wss://api.openai.test/v1/realtime",
        model: "gpt-realtime-whisper",
        timeoutMs: 30_000,
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
      "transcription_session.update",
      "input_audio_buffer.append",
      "input_audio_buffer.commit",
    ]);
  });

  it("configures a transcription session before sending audio", async () => {
    const socket = new FakeRealtimeSocket();
    const adapter = new OpenAIRealtimeTranscription({
      config: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "wss://api.openai.test/v1/realtime",
        model: "gpt-realtime-whisper",
        timeoutMs: 30_000,
      },
      env: { OPENAI_API_KEY: "test-key" },
      webSocketFactory: () => socket,
    });

    const transcriptPromise = adapter.transcribeStream({
      chunks: chunksFromText("audio"),
    });

    socket.emitOpen();
    await socket.waitForSentType("input_audio_buffer.commit");
    socket.emitMessage({
      transcript: "list alarms",
      type: "conversation.item.input_audio_transcription.completed",
    });

    await expect(transcriptPromise).resolves.toEqual({ text: "list alarms" });
    expect(socket.sentMessages[0]).toEqual({
      session: {
        input_audio_format: "pcm16",
        input_audio_transcription: {
          model: "gpt-realtime-whisper",
        },
        turn_detection: null,
        type: "transcription",
      },
      type: "transcription_session.update",
    });
  });

  it("rejects with a safe realtime error when the provider sends an error event", async () => {
    const socket = new FakeRealtimeSocket();
    const adapter = new OpenAIRealtimeTranscription({
      config: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "wss://api.openai.test/v1/realtime",
        model: "gpt-realtime-whisper",
        timeoutMs: 30_000,
      },
      env: { OPENAI_API_KEY: "test-key" },
      webSocketFactory: () => socket,
    });

    const transcriptPromise = adapter.transcribeStream({
      chunks: chunksFromText("audio"),
    });

    socket.emitOpen();
    await socket.waitForSentType("input_audio_buffer.commit");
    socket.emitMessage({
      error: {
        code: "invalid_value",
        message: "Unsupported session shape.",
        type: "invalid_request_error",
      },
      type: "error",
    });

    await expect(transcriptPromise).rejects.toThrow(
      "Realtime transcription failed.",
    );
    expect(socket.closed).toBe(true);
  });

  it("rejects without an API key", async () => {
    const adapter = new OpenAIRealtimeTranscription({
      config: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "wss://api.openai.test/v1/realtime",
        model: "gpt-realtime-whisper",
        timeoutMs: 30_000,
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

  it("rejects through the adapter when the socket fails before audio capture finishes", async () => {
    const socket = new FakeRealtimeSocket();
    const audio = createControlledAudioStream();
    const adapter = new OpenAIRealtimeTranscription({
      config: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "wss://api.openai.test/v1/realtime",
        model: "gpt-realtime-whisper",
        timeoutMs: 30_000,
      },
      env: { OPENAI_API_KEY: "test-key" },
      webSocketFactory: () => socket,
    });

    const transcriptPromise = adapter.transcribeStream({
      chunks: audio.chunks,
    });
    let rejection: unknown;
    const observedRejection = transcriptPromise.catch((error: unknown) => {
      rejection = error;
    });

    socket.emitOpen();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    socket.emitError();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    audio.finish();

    await observedRejection;
    expect(rejection).toEqual(
      expect.objectContaining({
        message: "Realtime transcription socket failed.",
      }),
    );
  });

  it("rejects and closes the socket when the completed transcript never arrives", async () => {
    const socket = new FakeRealtimeSocket();
    const adapter = new OpenAIRealtimeTranscription({
      config: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "wss://api.openai.test/v1/realtime",
        model: "gpt-realtime-whisper",
        timeoutMs: 1,
      },
      env: { OPENAI_API_KEY: "test-key" },
      webSocketFactory: () => socket,
    });

    const transcriptPromise = adapter.transcribeStream({
      chunks: chunksFromText("audio"),
    });

    socket.emitOpen();
    await socket.waitForSentType("input_audio_buffer.commit");

    await expect(transcriptPromise).rejects.toThrow(
      "Realtime transcription timed out after 1ms.",
    );
    expect(socket.closed).toBe(true);
  });

  it("rejects and closes the socket when the realtime socket never opens", async () => {
    const socket = new FakeRealtimeSocket();
    const adapter = new OpenAIRealtimeTranscription({
      config: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "wss://api.openai.test/v1/realtime",
        model: "gpt-realtime-whisper",
        timeoutMs: 1,
      },
      env: { OPENAI_API_KEY: "test-key" },
      webSocketFactory: () => socket,
    });

    await expect(
      adapter.transcribeStream({ chunks: chunksFromText("audio") }),
    ).rejects.toThrow("Realtime transcription timed out after 1ms.");
    expect(socket.closed).toBe(true);
    expect(socket.sentMessages).toEqual([]);
  });
});

class FakeRealtimeSocket {
  closed = false;
  readonly sentMessages: Array<Record<string, unknown>> = [];
  private readonly listeners: Record<string, Array<(event?: unknown) => void>> =
    {};

  addEventListener(type: string, listener: (event?: unknown) => void): void {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
  }

  close(): void {
    this.closed = true;
  }

  send(message: string): void {
    this.sentMessages.push(JSON.parse(message) as Record<string, unknown>);
  }

  emitOpen(): void {
    this.emit("open");
  }

  emitMessage(message: Record<string, unknown>): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  emitError(): void {
    this.emit("error");
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

function createControlledAudioStream(): {
  chunks: AsyncIterable<Uint8Array>;
  finish(): void;
} {
  let finish: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });

  return {
    chunks: (async function* () {
      await finished;
      yield Buffer.from("", "utf8");
    })(),
    finish,
  };
}
