import { OpenAIRealtimeTranscription } from "./openai-realtime-transcription.js";
import { TestRealtimeSocket } from "../../test-support/adapter-contract.js";

describe("OpenAIRealtimeTranscription", () => {
  it("streams audio chunks and emits transcript deltas", async () => {
    const socket = new TestRealtimeSocket();
    let requestUrl = "";
    const deltas: string[] = [];
    const adapter = createRealtimeTranscriptionAdapter({
      socket,
      webSocketFactory: (request) => {
        requestUrl = request.url;

        return socket;
      },
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
    expect(requestUrl).toBe(
      "wss://api.openai.test/v1/realtime?intent=transcription",
    );
    expect(deltas).toEqual(["list ", "alarms"]);
    expect(socket.sentMessages.map((message) => message.type)).toEqual([
      "session.update",
      "input_audio_buffer.append",
      "input_audio_buffer.commit",
    ]);
  });

  it("configures a transcription session before sending audio", async () => {
    const socket = new TestRealtimeSocket();
    const adapter = createRealtimeTranscriptionAdapter({ socket });

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
        audio: {
          input: {
            format: {
              rate: 24000,
              type: "audio/pcm",
            },
            transcription: {
              model: "gpt-realtime-whisper",
            },
            turn_detection: null,
          },
        },
        type: "transcription",
      },
      type: "session.update",
    });
  });

  it("rejects with a safe realtime error when the provider sends an error event", async () => {
    const socket = new TestRealtimeSocket();
    const adapter = createRealtimeTranscriptionAdapter({ socket });

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

    await expect(transcriptPromise).rejects.toMatchObject({
      event: {
        error: {
          code: "invalid_value",
          message: "Unsupported session shape.",
          type: "invalid_request_error",
        },
        type: "error",
      },
      message: "Realtime transcription failed.",
    });
    expect(socket.closed).toBe(true);
  });

  it("rejects without an API key", async () => {
    const adapter = createRealtimeTranscriptionAdapter({
      env: {},
    });

    await expect(
      adapter.transcribeStream({ chunks: chunksFromText("audio") }),
    ).rejects.toThrow(
      "OpenAI API key environment variable OPENAI_API_KEY is not set.",
    );
  });

  it("rejects through the adapter when the socket fails before audio capture finishes", async () => {
    const socket = new TestRealtimeSocket();
    const audio = createControlledAudioStream();
    const adapter = createRealtimeTranscriptionAdapter({ socket });

    const transcriptPromise = adapter.transcribeStream({
      chunks: audio.chunks,
    });
    let rejection: unknown;
    const observedRejection = transcriptPromise.catch((error: unknown) => {
      rejection = error;
    });

    socket.emitOpen();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    socket.emitError({ code: "ECONNRESET" });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    audio.finish();

    await observedRejection;
    expect(rejection).toEqual(
      expect.objectContaining({
        event: { code: "ECONNRESET" },
        message: "Realtime transcription socket failed.",
      }),
    );
  });

  it("preserves socket error payloads before the socket opens", async () => {
    const socket = new TestRealtimeSocket();
    const adapter = createRealtimeTranscriptionAdapter({ socket });

    const transcriptPromise = adapter.transcribeStream({
      chunks: chunksFromText("audio"),
    });

    socket.emitError({ code: "ECONNREFUSED" });

    await expect(transcriptPromise).rejects.toMatchObject({
      event: { code: "ECONNREFUSED" },
      message: "Realtime transcription socket failed.",
    });
    expect(socket.closed).toBe(true);
  });

  it("settles malformed message payload failures without waiting for timeout", async () => {
    const socket = new TestRealtimeSocket();
    const adapter = createRealtimeTranscriptionAdapter({ socket });

    const transcriptPromise = adapter.transcribeStream({
      chunks: chunksFromText("audio"),
    });

    socket.emitOpen();
    await socket.waitForSentType("input_audio_buffer.commit");
    socket.emitRawMessage({ data: "not-json" });

    await expect(transcriptPromise).rejects.toMatchObject({
      message: "Realtime transcription message was invalid.",
    });
    expect(socket.closed).toBe(true);
  });

  it("rejects and closes the socket when the completed transcript never arrives", async () => {
    const socket = new TestRealtimeSocket();
    const adapter = createRealtimeTranscriptionAdapter({
      socket,
      timeoutMs: 1,
    });

    const transcriptPromise = adapter.transcribeStream({
      chunks: chunksFromText("audio"),
    });
    const rejection = transcriptPromise.then(
      () => null,
      (error: unknown) => error,
    );

    socket.emitOpen();
    await socket.waitForSentType("input_audio_buffer.commit");

    await expect(rejection).resolves.toMatchObject({
      message: "Realtime transcription timed out after 1ms.",
    });
    expect(socket.closed).toBe(true);
  });

  it("rejects and closes the socket when the realtime socket never opens", async () => {
    const socket = new TestRealtimeSocket();
    const adapter = createRealtimeTranscriptionAdapter({
      socket,
      timeoutMs: 1,
    });

    await expect(
      adapter.transcribeStream({ chunks: chunksFromText("audio") }),
    ).rejects.toThrow("Realtime transcription timed out after 1ms.");
    expect(socket.closed).toBe(true);
    expect(socket.sentMessages).toEqual([]);
  });

  it("closes a pending realtime socket when shutdown is requested", async () => {
    const socket = new TestRealtimeSocket();
    const shutdown = new AbortController();
    const adapter = createRealtimeTranscriptionAdapter({
      shutdownSignal: shutdown.signal,
      socket,
    });
    const transcriptPromise = adapter.transcribeStream({
      chunks: chunksFromText("audio"),
    });

    shutdown.abort(new Error("service shutdown requested"));

    await expect(transcriptPromise).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: "service shutdown requested",
      }) as Error,
      message: "Realtime transcription was aborted.",
    });
    expect(socket.closed).toBe(true);
    expect(socket.sentMessages).toEqual([]);
  });

  it("closes the realtime socket when shutdown interrupts transcription", async () => {
    const socket = new TestRealtimeSocket();
    const shutdown = new AbortController();
    const adapter = createRealtimeTranscriptionAdapter({
      shutdownSignal: shutdown.signal,
      socket,
    });
    const transcriptPromise = adapter.transcribeStream({
      chunks: chunksFromText("audio"),
    });

    socket.emitOpen();
    await socket.waitForSentType("input_audio_buffer.commit");
    shutdown.abort(new Error("service shutdown requested"));

    await expect(transcriptPromise).rejects.toThrow(
      "Realtime transcription was aborted.",
    );
    expect(socket.closed).toBe(true);
  });

  it("rejects an unexpected socket close and removes session listeners", async () => {
    const socket = new TestRealtimeSocket();
    const audio = createControlledAudioStream();
    const adapter = createRealtimeTranscriptionAdapter({
      socket,
      timeoutMs: 5,
    });
    const transcription = adapter.transcribeStream({
      chunks: audio.chunks,
    });

    socket.emitOpen();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    socket.emitClose({ code: 1006 });
    audio.finish();

    await expect(transcription).rejects.toMatchObject({
      event: { code: 1006 },
      message: "Realtime transcription socket closed unexpectedly.",
    });
    expect(socket.listenerCount()).toBe(0);
  });

  it("preserves provider failure when closing the socket also fails", async () => {
    const closeError = new Error("socket close failed");
    const socket = new TestRealtimeSocket({ closeError });
    const audio = createControlledAudioStream();
    const adapter = createRealtimeTranscriptionAdapter({ socket });
    const transcription = adapter.transcribeStream({
      chunks: audio.chunks,
    });

    socket.emitOpen();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    socket.emitError({ code: "ECONNRESET" });
    audio.finish();

    await expect(transcription).rejects.toMatchObject({
      cause: closeError,
      event: { code: "ECONNRESET" },
      message: "Realtime transcription socket failed.",
    });
    expect(socket.listenerCount()).toBe(0);
  });

  it("preserves audio failure when iterator cleanup also fails", async () => {
    const socket = new TestRealtimeSocket();
    const inputError = new Error("audio input failed");
    const cleanupError = new Error("audio cleanup failed");
    const chunks: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(inputError),
        return: () => Promise.reject(cleanupError),
      }),
    };
    const adapter = createRealtimeTranscriptionAdapter({ socket });
    const transcription = adapter.transcribeStream({ chunks });

    socket.emitOpen();

    await expect(transcription).rejects.toMatchObject({
      cause: cleanupError,
      message: "audio input failed",
    });
  });

  it("waits for audio iterator cleanup before rejecting the turn", async () => {
    const socket = new TestRealtimeSocket();
    const inputError = new Error("audio input failed");
    let finishCleanup: () => void = () => {};
    const cleanup = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    const chunks: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(inputError),
        return: () => cleanup.then(() => ({ done: true, value: undefined })),
      }),
    };
    const adapter = createRealtimeTranscriptionAdapter({ socket });
    const transcription = adapter.transcribeStream({ chunks });
    const settled = vi.fn();
    void transcription.catch(settled);

    socket.emitOpen();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(settled).not.toHaveBeenCalled();
    finishCleanup();
    await expect(transcription).rejects.toBe(inputError);
  });

  it("removes all session listeners after successful transcription", async () => {
    const socket = new TestRealtimeSocket();
    const adapter = createRealtimeTranscriptionAdapter({ socket });
    const transcription = adapter.transcribeStream({
      chunks: chunksFromText("audio"),
    });

    socket.emitOpen();
    await socket.waitForSentType("input_audio_buffer.commit");
    socket.emitMessage({
      transcript: "list alarms",
      type: "conversation.item.input_audio_transcription.completed",
    });

    await expect(transcription).resolves.toEqual({ text: "list alarms" });
    expect(socket.listenerCount()).toBe(0);
  });
});

function createRealtimeTranscriptionAdapter(options: {
  env?: Record<string, string | undefined>;
  socket?: TestRealtimeSocket;
  shutdownSignal?: AbortSignal;
  timeoutMs?: number;
  webSocketFactory?: ConstructorParameters<
    typeof OpenAIRealtimeTranscription
  >[0]["webSocketFactory"];
}): OpenAIRealtimeTranscription {
  const socket = options.socket ?? new TestRealtimeSocket();

  return new OpenAIRealtimeTranscription({
    config: {
      apiKeyEnv: "OPENAI_API_KEY",
      baseUrl: "wss://api.openai.test/v1/realtime",
      model: "gpt-realtime-whisper",
      timeoutMs: options.timeoutMs ?? 30_000,
    },
    env: options.env ?? { OPENAI_API_KEY: "test-key" },
    ...(options.shutdownSignal
      ? { shutdownSignal: options.shutdownSignal }
      : {}),
    webSocketFactory: options.webSocketFactory ?? (() => socket),
  });
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
