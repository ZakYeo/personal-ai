import { cancelReaderBestEffort } from "./bounded-reader-cancellation.js";

interface ProviderJsonErrorOptions {
  cause?: unknown;
  message: string;
  responseBody?: string;
  status?: number;
}

interface FetchProviderJsonOptions {
  cancelledMessage?: string;
  createError(options: ProviderJsonErrorOptions): Error;
  fetch: typeof fetch;
  invalidJsonMessage: string;
  maxResponseBodyBytes?: number;
  nonOkMessage(status: number): string;
  request: RequestInit;
  responseBodyTooLargeMessage?: string;
  signal?: AbortSignal;
  timeoutMessage: string;
  timeoutMs: number;
  url: string;
}

export async function fetchProviderJson(
  options: FetchProviderJsonOptions,
): Promise<unknown> {
  const controller = new AbortController();
  let cancelledByCaller = false;
  let timedOut = false;
  const cancelFromCaller = () => {
    if (controller.signal.aborted) return;
    cancelledByCaller = true;
    controller.abort(options.signal?.reason);
  };
  if (options.signal?.aborted) {
    cancelFromCaller();
  } else {
    options.signal?.addEventListener("abort", cancelFromCaller, { once: true });
  }
  const timeout = setTimeout(() => {
    if (controller.signal.aborted) return;
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);

  try {
    const response = await options.fetch(options.url, {
      ...options.request,
      signal: controller.signal,
    });
    const responseBody = await readResponseBody(
      response,
      controller.signal,
      options.maxResponseBodyBytes,
    );

    if (!response.ok) {
      throw options.createError({
        message: options.nonOkMessage(response.status),
        responseBody,
        status: response.status,
      });
    }

    try {
      return JSON.parse(responseBody) as unknown;
    } catch (error) {
      throw options.createError({
        cause: error,
        message: options.invalidJsonMessage,
        responseBody,
        status: response.status,
      });
    }
  } catch (error) {
    if (error instanceof ResponseBodyTooLargeError) {
      throw options.createError({
        cause: error,
        message:
          options.responseBodyTooLargeMessage ??
          "Provider response body exceeded the configured byte limit.",
      });
    }
    if (
      isAbortError(error) ||
      cancelledByCaller ||
      timedOut ||
      controller.signal.aborted
    ) {
      throw options.createError({
        cause: error,
        message:
          cancelledByCaller && options.cancelledMessage
            ? options.cancelledMessage
            : options.timeoutMessage,
      });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancelFromCaller);
  }
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

class ResponseBodyTooLargeError extends Error {}

async function readResponseBody(
  response: Response,
  signal: AbortSignal,
  maxBytes: number | undefined,
): Promise<string> {
  if (!response.body) return "";
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    maxBytes !== undefined &&
    Number.isFinite(declaredLength) &&
    declaredLength > maxBytes
  ) {
    await cancelReaderBestEffort(response.body.getReader());
    throw new ResponseBodyTooLargeError();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = "";
  try {
    while (true) {
      const next = await readWithAbort(reader, signal);
      if (next.done) return body + decoder.decode();
      if (!next.value)
        throw new Error("Provider body reader returned no data.");
      bytesRead += next.value.byteLength;
      if (maxBytes !== undefined && bytesRead > maxBytes) {
        await cancelReaderBestEffort(reader);
        throw new ResponseBodyTooLargeError();
      }
      body += decoder.decode(next.value, { stream: true });
    }
  } catch (error) {
    if (signal.aborted) {
      await cancelReaderBestEffort(reader, { reason: signal.reason });
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ByteStreamReadResult> {
  if (signal.aborted) {
    return Promise.reject(createAbortError(signal.reason));
  }
  return new Promise((resolve, reject) => {
    const abort = () => {
      void reader.cancel(signal.reason).catch(() => {});
      reject(createAbortError(signal.reason));
    };
    signal.addEventListener("abort", abort, { once: true });
    void reader.read().then(
      (result) => {
        signal.removeEventListener("abort", abort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(
          error instanceof Error
            ? error
            : new Error("Provider body read failed.", { cause: error }),
        );
      },
    );
  });
}

interface ByteStreamReadResult {
  done: boolean;
  value: Uint8Array | undefined;
}

function createAbortError(reason: unknown): Error {
  const error = new Error(
    reason instanceof Error ? reason.message : "The operation was aborted.",
  );
  error.name = "AbortError";
  return error;
}
