import type { OpenAIIntentConfig } from "../../ports/assistant.js";
import { fetchProviderJson, trimTrailingSlash } from "../http-json-client.js";
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
  return fetchProviderJson({
    createError: ({ cause, message, responseBody, status }) =>
      new OpenAIIntentError(message, status, responseBody, { cause }),
    fetch: options.fetch,
    invalidJsonMessage: "OpenAI intent response body was not valid JSON.",
    nonOkMessage: (status) =>
      `OpenAI intent request failed with status ${status}.`,
    request: {
      body: JSON.stringify(options.body),
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
    },
    timeoutMessage: `OpenAI intent request timed out after ${options.config.timeoutMs}ms.`,
    timeoutMs: options.config.timeoutMs,
    url: `${trimTrailingSlash(options.config.baseUrl)}/responses`,
  });
}
