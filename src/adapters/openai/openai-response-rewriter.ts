import type {
  AssistantContext,
  OpenAIIntentConfig,
} from "../../ports/assistant.js";
import type {
  ResponseRewriteRequest,
  ResponseRewriterPort,
} from "../../ports/response-rewriter.js";
import { fetchProviderJson, trimTrailingSlash } from "../http-json-client.js";
import { extractOpenAIOutputText } from "./openai-output-extractor.js";
import { OpenAIResponseRewriterError } from "./openai-response-rewriter-error.js";
import { parseOpenAIResponseRewrite } from "./openai-response-rewriter-output-parser.js";
import { createOpenAIResponseRewriteRequestBody } from "./openai-response-rewriter-request.js";

interface OpenAIResponseRewriterOptions {
  config: OpenAIIntentConfig;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

export class OpenAIResponseRewriter implements ResponseRewriterPort {
  constructor(private readonly options: OpenAIResponseRewriterOptions) {}

  async rewrite(request: ResponseRewriteRequest, context: AssistantContext) {
    const apiKey = this.options.env[this.options.config.apiKeyEnv];

    if (!apiKey) {
      throw new OpenAIResponseRewriterError(
        `OpenAI API key environment variable ${this.options.config.apiKeyEnv} is not set.`,
      );
    }

    const response = await fetchProviderJson({
      createError: ({ cause, message, responseBody, status }) =>
        new OpenAIResponseRewriterError(message, status, responseBody, {
          cause,
        }),
      fetch: this.options.fetch,
      invalidJsonMessage:
        "OpenAI response rewrite response body was not valid JSON.",
      nonOkMessage: (status) =>
        `OpenAI response rewrite request failed with status ${status}.`,
      request: {
        body: JSON.stringify(
          createOpenAIResponseRewriteRequestBody(
            request,
            context,
            this.options.config,
          ),
        ),
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
      },
      timeoutMessage: `OpenAI response rewrite request timed out after ${this.options.config.timeoutMs}ms.`,
      timeoutMs: this.options.config.timeoutMs,
      url: `${trimTrailingSlash(this.options.config.baseUrl)}/responses`,
    });

    return parseOpenAIResponseRewrite(
      extractOpenAIOutputText(response, {
        createError: (message) => new OpenAIResponseRewriterError(message),
        missingMessage:
          "OpenAI response rewrite response did not include output text.",
        notObjectMessage:
          "OpenAI response rewrite response body must be an object.",
      }),
    );
  }
}

export { OpenAIResponseRewriterError } from "./openai-response-rewriter-error.js";
