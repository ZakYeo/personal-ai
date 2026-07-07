import type {
  StreamingTextToSpeechPort,
  SynthesizedSpeechStream,
} from "../../ports/voice.js";
import {
  createOpenAIStatusError,
  createOpenAIUrl,
  resolveOpenAIApiKey,
} from "./openai-voice-client.js";

interface OpenAIStreamingSpeechConfig {
  apiKeyEnv: string;
  baseUrl: string;
  instructions: string;
  model: string;
  responseFormat: string;
  voice: string;
}

interface OpenAIStreamingSpeechOptions {
  config: OpenAIStreamingSpeechConfig;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

export class OpenAIStreamingSpeech implements StreamingTextToSpeechPort {
  constructor(private readonly options: OpenAIStreamingSpeechOptions) {}

  async synthesizeStream(text: string): Promise<SynthesizedSpeechStream> {
    const apiKey = resolveOpenAIApiKey(this.options.config, this.options.env);

    const response = await this.options.fetch(
      createOpenAIUrl(this.options.config.baseUrl, "audio/speech"),
      {
        body: JSON.stringify({
          input: text,
          instructions: this.options.config.instructions,
          model: this.options.config.model,
          response_format: this.options.config.responseFormat,
          voice: this.options.config.voice,
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    if (!response.ok) {
      throw createOpenAIStatusError("speech", response.status);
    }

    if (!response.body) {
      throw new Error("OpenAI speech response did not include an audio body.");
    }

    return {
      chunks: streamToAsyncIterable(response.body),
      text,
    };
  }
}

async function* streamToAsyncIterable(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        return;
      }

      yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}
