import { fetchProviderJson, trimTrailingSlash } from "../http-json-client.js";
import type { OpenAIResponsesConfig } from "./openai-responses-config.js";

interface OpenAIResponsesErrorOptions {
  cause?: unknown;
  message: string;
  responseBody?: string;
  status?: number;
}

interface RequestOpenAIResponseOptions {
  body: unknown;
  config: OpenAIResponsesConfig;
  createError(options: OpenAIResponsesErrorOptions): Error;
  env: Record<string, string | undefined>;
  fetch: typeof globalThis.fetch;
  operation: string;
}

export function requestOpenAIResponse(
  options: RequestOpenAIResponseOptions,
): Promise<unknown> {
  const apiKey = options.env[options.config.apiKeyEnv];

  if (!apiKey) {
    throw options.createError({
      message: `OpenAI API key environment variable ${options.config.apiKeyEnv} is not set.`,
    });
  }

  return fetchProviderJson({
    createError: (errorOptions) => options.createError(errorOptions),
    fetch: options.fetch,
    invalidJsonMessage: `OpenAI ${options.operation} response body was not valid JSON.`,
    nonOkMessage: (status) =>
      `OpenAI ${options.operation} request failed with status ${status}.`,
    request: {
      body: JSON.stringify(options.body),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
    },
    timeoutMessage: `OpenAI ${options.operation} request timed out after ${options.config.timeoutMs}ms.`,
    timeoutMs: options.config.timeoutMs,
    url: `${trimTrailingSlash(options.config.baseUrl)}/responses`,
  });
}
