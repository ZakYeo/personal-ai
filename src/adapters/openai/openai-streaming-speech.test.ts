import { OpenAIStreamingSpeech } from "./openai-streaming-speech.js";
import { createAbortingFetchStub } from "../../test-support/adapter-contract.js";

describe("OpenAIStreamingSpeech", () => {
  it("streams speech audio chunks from the OpenAI speech endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(streamFromText("audio"), {
        status: 200,
      }),
    );
    const adapter = new OpenAIStreamingSpeech({
      config: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.test/v1",
        instructions: "Speak clearly.",
        model: "gpt-4o-mini-tts",
        responseFormat: "pcm",
        timeoutMs: 30_000,
        voice: "coral",
      },
      env: { OPENAI_API_KEY: "test-key" },
      fetch,
    });

    const speech = await adapter.synthesizeStream("Alarm set.");

    await expect(readChunksAsText(speech.chunks)).resolves.toBe("audio");
    expect(speech.text).toBe("Alarm set.");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.test/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("rejects without an API key", async () => {
    const adapter = new OpenAIStreamingSpeech({
      config: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.test/v1",
        instructions: "Speak clearly.",
        model: "gpt-4o-mini-tts",
        responseFormat: "pcm",
        timeoutMs: 30_000,
        voice: "coral",
      },
      env: {},
      fetch: vi.fn(),
    });

    await expect(adapter.synthesizeStream("Alarm set.")).rejects.toThrow(
      "OpenAI API key environment variable OPENAI_API_KEY is not set.",
    );
  });

  it("preserves provider status and body diagnostics for non-OK responses", async () => {
    const adapter = new OpenAIStreamingSpeech({
      config: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.test/v1",
        instructions: "Speak clearly.",
        model: "gpt-4o-mini-tts",
        responseFormat: "pcm",
        timeoutMs: 30_000,
        voice: "coral",
      },
      env: { OPENAI_API_KEY: "test-key" },
      fetch: vi.fn().mockResolvedValue(
        new Response('{"error":"quota exceeded"}', {
          status: 429,
        }),
      ),
    });

    await expect(adapter.synthesizeStream("Alarm set.")).rejects.toMatchObject({
      message: "OpenAI speech request failed with status 429.",
      responseBody: '{"error":"quota exceeded"}',
      status: 429,
    });
  });

  it("aborts speech requests after the configured timeout", async () => {
    vi.useFakeTimers();
    const adapter = createAdapter({
      fetch: createAbortingFetchStub(),
      timeoutMs: 25,
    });

    try {
      const speechPromise = adapter.synthesizeStream("Alarm set.");
      const failure = speechPromise.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(25);

      await expect(failure).resolves.toMatchObject({
        message: "OpenAI speech request timed out after 25ms.",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts a pending request when runtime shutdown is requested", async () => {
    const shutdown = new AbortController();
    const adapter = createAdapter({
      fetch: createAbortingFetchStub(),
      shutdownSignal: shutdown.signal,
    });
    const speechPromise = adapter.synthesizeStream("Alarm set.");

    shutdown.abort(new Error("service shutdown requested"));

    await expect(speechPromise).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: "service shutdown requested",
      }) as Error,
      message: "OpenAI speech request was aborted.",
    });
  });

  it("aborts a stalled response body after the configured timeout", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const adapter = createAdapter({
      fetch: vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            cancel,
          }),
        ),
      ),
      timeoutMs: 25,
    });

    try {
      const speech = await adapter.synthesizeStream("Alarm set.");
      const next = speech.chunks[Symbol.asyncIterator]().next();
      const failure = next.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(25);

      await expect(failure).resolves.toMatchObject({
        message: "OpenAI speech request timed out after 25ms.",
      });
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels the response reader when the consumer exits early", async () => {
    const cancel = vi.fn();
    const adapter = createAdapter({
      fetch: vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            cancel,
            start(controller) {
              controller.enqueue(Buffer.from("first", "utf8"));
            },
          }),
        ),
      ),
    });
    const speech = await adapter.synthesizeStream("Alarm set.");
    const iterator = speech.chunks[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    await iterator.return?.();

    expect(cancel).toHaveBeenCalledOnce();
  });
});

function createAdapter(options: {
  fetch: typeof fetch;
  shutdownSignal?: AbortSignal;
  timeoutMs?: number;
}): OpenAIStreamingSpeech {
  return new OpenAIStreamingSpeech({
    config: {
      apiKeyEnv: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.test/v1",
      instructions: "Speak clearly.",
      model: "gpt-4o-mini-tts",
      responseFormat: "pcm",
      timeoutMs: options.timeoutMs ?? 30_000,
      voice: "coral",
    },
    env: { OPENAI_API_KEY: "test-key" },
    fetch: options.fetch,
    ...(options.shutdownSignal
      ? { shutdownSignal: options.shutdownSignal }
      : {}),
  });
}

function streamFromText(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(Buffer.from(text, "utf8"));
      controller.close();
    },
  });
}

async function readChunksAsText(
  chunks: AsyncIterable<Uint8Array>,
): Promise<string> {
  const buffers: Buffer[] = [];

  for await (const chunk of chunks) {
    buffers.push(Buffer.from(chunk));
  }

  return Buffer.concat(buffers).toString("utf8");
}
