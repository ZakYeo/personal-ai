import type {
  StreamingTextToSpeechPort,
  SynthesizedSpeechStream,
} from "../../ports/voice.js";
import { cancelReaderBestEffort } from "../bounded-reader-cancellation.js";
import { createOpenAIUrl, resolveOpenAIApiKey } from "./openai-client.js";
import { createOpenAIVoiceProviderError } from "./openai-voice-provider-error.js";
import type { OpenAIStreamingSpeechConfig } from "./openai-streaming-voice-config.js";

interface OpenAIStreamingSpeechOptions {
  config: OpenAIStreamingSpeechConfig;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  shutdownSignal?: AbortSignal;
}

export class OpenAIStreamingSpeech implements StreamingTextToSpeechPort {
  constructor(private readonly options: OpenAIStreamingSpeechOptions) {}

  async synthesizeStream(text: string): Promise<SynthesizedSpeechStream> {
    const apiKey = resolveOpenAIApiKey(this.options.config, this.options.env);
    const abortScope = createSpeechAbortScope(
      this.options.config.timeoutMs,
      this.options.shutdownSignal,
    );

    try {
      abortScope.armTimeout();
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
          signal: abortScope.signal,
        },
      );
      abortScope.disarmTimeout();

      if (!response.ok) {
        abortScope.armTimeout();
        const responseBody = await response.text();
        abortScope.disarmTimeout();
        throw createOpenAIVoiceProviderError({
          message: `OpenAI speech request failed with status ${response.status}.`,
          responseBody,
          status: response.status,
        });
      }

      if (!response.body) {
        throw new Error(
          "OpenAI speech response did not include an audio body.",
        );
      }

      return {
        chunks: streamToAsyncIterable(response.body, abortScope),
        text,
      };
    } catch (error) {
      abortScope.disarmTimeout();
      abortScope.dispose();

      if (abortScope.signal.aborted) {
        throw createSpeechAbortError(abortScope);
      }

      throw error;
    }
  }
}

async function* streamToAsyncIterable(
  stream: ReadableStream<Uint8Array>,
  abortScope: SpeechAbortScope,
): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  let completed = false;

  try {
    while (true) {
      const result = await readWithAbort(reader, abortScope);

      if (result.done) {
        completed = true;
        return;
      }

      yield result.value;
    }
  } catch (error) {
    if (abortScope.signal.aborted) {
      throw createSpeechAbortError(abortScope);
    }

    throw error;
  } finally {
    if (!completed) {
      await cancelReaderBestEffort(reader, {
        reason: abortReason(abortScope.signal),
        waitMs: abortScope.timeoutMs,
      });
    }

    reader.releaseLock();
    abortScope.dispose();
  }
}

interface SpeechAbortScope {
  armTimeout(): void;
  disarmTimeout(): void;
  dispose(): void;
  signal: AbortSignal;
  timedOut(): boolean;
  timeoutMs: number;
}

function createSpeechAbortScope(
  timeoutMs: number,
  shutdownSignal: AbortSignal | undefined,
): SpeechAbortScope {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onShutdown = (): void => {
    controller.abort(abortReason(shutdownSignal));
  };
  const disarmTimeout = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const armTimeout = (): void => {
    disarmTimeout();
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort(
        new Error(`OpenAI speech timed out after ${timeoutMs}ms.`),
      );
    }, timeoutMs);
  };
  const dispose = (): void => {
    disarmTimeout();
    shutdownSignal?.removeEventListener("abort", onShutdown);
  };

  controller.signal.addEventListener("abort", dispose, { once: true });

  if (shutdownSignal?.aborted) {
    onShutdown();
  } else {
    shutdownSignal?.addEventListener("abort", onShutdown, { once: true });
  }

  return {
    armTimeout,
    disarmTimeout,
    dispose,
    signal: controller.signal,
    timedOut: () => timedOut,
    timeoutMs,
  };
}

function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  scope: SpeechAbortScope,
): ReturnType<ReadableStreamDefaultReader<Uint8Array>["read"]> {
  const { signal } = scope;
  if (signal.aborted) {
    return Promise.reject(toError(abortReason(signal)));
  }

  scope.armTimeout();
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      scope.disarmTimeout();
      reject(toError(abortReason(signal)));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    void reader.read().then(
      (result) => {
        scope.disarmTimeout();
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error: unknown) => {
        scope.disarmTimeout();
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function createSpeechAbortError(scope: SpeechAbortScope): Error {
  return createOpenAIVoiceProviderError({
    cause: abortReason(scope.signal),
    message: scope.timedOut()
      ? `OpenAI speech request timed out after ${scope.timeoutMs}ms.`
      : "OpenAI speech request was aborted.",
  });
}

function abortReason(signal: AbortSignal | undefined): unknown {
  return signal?.reason as unknown;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
