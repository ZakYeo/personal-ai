import {
  defaultMaxProviderResponseBodyBytes,
  readBoundedResponseText,
  ResponseBodyTooLargeError,
} from "./bounded-response-body.js";

interface ProviderJsonErrorOptions {
  cause?: unknown;
  message: string;
  requestId?: string;
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
  let requestId: string | undefined;
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
    requestId = response.headers.get("x-request-id") ?? undefined;
    const responseBody = await readBoundedResponseText(
      response,
      controller.signal,
      options.maxResponseBodyBytes ?? defaultMaxProviderResponseBodyBytes,
    );

    if (!response.ok) {
      throw options.createError({
        message: options.nonOkMessage(response.status),
        ...(requestId ? { requestId } : {}),
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
        ...(requestId ? { requestId } : {}),
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
        ...(requestId ? { requestId } : {}),
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
