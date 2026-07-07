import { OpenAIStreamingSpeech } from "./openai-streaming-speech.js";

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
});

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
