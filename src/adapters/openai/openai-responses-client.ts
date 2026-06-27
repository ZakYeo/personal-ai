import type { OpenAIIntentConfig } from "../../ports/assistant.js";
import { OpenAIIntentError } from "./openai-intent-error.js";

interface FetchOpenAIResponseOptions {
  apiKey: string;
  body: unknown;
  config: OpenAIIntentConfig;
  fetch: typeof fetch;
}

export async function fetchOpenAIResponse(
  options: FetchOpenAIResponseOptions,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.config.timeoutMs,
  );

  try {
    const response = await options.fetch(
      `${trimTrailingSlash(options.config.baseUrl)}/responses`,
      {
        body: JSON.stringify(options.body),
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      },
    );

    const responseBody = await response.text();

    if (!response.ok) {
      throw new OpenAIIntentError(
        `OpenAI intent request failed with status ${response.status}.`,
        response.status,
        responseBody,
      );
    }

    try {
      return JSON.parse(responseBody) as unknown;
    } catch (error) {
      throw new OpenAIIntentError(
        "OpenAI intent response body was not valid JSON.",
        response.status,
        responseBody,
        { cause: error },
      );
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw new OpenAIIntentError(
        `OpenAI intent request timed out after ${options.config.timeoutMs}ms.`,
        undefined,
        undefined,
        { cause: error },
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}
