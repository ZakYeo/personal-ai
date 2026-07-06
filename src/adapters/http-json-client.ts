interface ProviderJsonErrorOptions {
  cause?: unknown;
  message: string;
  responseBody?: string;
  status?: number;
}

interface FetchProviderJsonOptions {
  createError(options: ProviderJsonErrorOptions): Error;
  fetch: typeof fetch;
  invalidJsonMessage: string;
  nonOkMessage(status: number): string;
  request: RequestInit;
  timeoutMessage: string;
  timeoutMs: number;
  url: string;
}

export async function fetchProviderJson(
  options: FetchProviderJsonOptions,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await options.fetch(options.url, {
      ...options.request,
      signal: controller.signal,
    });
    const responseBody = await response.text();

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
    if (isAbortError(error)) {
      throw options.createError({
        cause: error,
        message: options.timeoutMessage,
      });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
