import { cancelReaderBestEffort } from "./bounded-reader-cancellation.js";

export const defaultMaxProviderResponseBodyBytes = 1024 * 1024;

export class ResponseBodyTooLargeError extends Error {}

export async function rejectOversizedDeclaredResponseBody(
  response: Response,
  maxBytes: number,
): Promise<void> {
  if (!response.body || !hasOversizedDeclaredBody(response, maxBytes)) return;

  const reader = response.body.getReader();
  try {
    await cancelReaderBestEffort(reader);
  } finally {
    reader.releaseLock();
  }
  throw new ResponseBodyTooLargeError();
}

export async function readBoundedResponseText(
  response: Response,
  signal: AbortSignal,
  maxBytes: number,
): Promise<string> {
  if (!response.body) return "";
  await rejectOversizedDeclaredResponseBody(response, maxBytes);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = "";
  try {
    while (true) {
      const next = await readWithAbort(reader, signal);
      if (next.done) return body + decoder.decode();
      if (!next.value) {
        throw new Error("Provider body reader returned no data.");
      }
      bytesRead += next.value.byteLength;
      if (bytesRead > maxBytes) {
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

function hasOversizedDeclaredBody(
  response: Response,
  maxBytes: number,
): boolean {
  const declaredLength = Number(response.headers.get("content-length"));
  return Number.isFinite(declaredLength) && declaredLength > maxBytes;
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
