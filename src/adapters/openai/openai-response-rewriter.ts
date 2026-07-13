import type { AssistantContext } from "../../ports/assistant.js";
import type {
  ResponseRewriteRequest,
  ResponseRewriterPort,
} from "../../ports/response-rewriter.js";
import { extractOpenAIOutputText } from "./openai-output-extractor.js";
import { OpenAIResponseRewriterError } from "./openai-response-rewriter-error.js";
import type { OpenAIResponsesConfig } from "./openai-responses-config.js";
import { requestOpenAIResponse } from "./openai-responses-client.js";
import { parseOpenAIResponseRewrite } from "./openai-response-rewriter-output-parser.js";
import { createOpenAIResponseRewriteRequestBody } from "./openai-response-rewriter-request.js";

interface OpenAIResponseRewriterOptions {
  config: OpenAIResponsesConfig;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

export class OpenAIResponseRewriter implements ResponseRewriterPort {
  constructor(private readonly options: OpenAIResponseRewriterOptions) {}

  async rewrite(request: ResponseRewriteRequest, context: AssistantContext) {
    const response = await requestOpenAIResponse({
      body: createOpenAIResponseRewriteRequestBody(
        request,
        context,
        this.options.config,
      ),
      config: this.options.config,
      createError: ({ cause, message, responseBody, status }) =>
        new OpenAIResponseRewriterError(message, status, responseBody, {
          cause,
        }),
      env: this.options.env,
      fetch: this.options.fetch,
      operation: "response rewrite",
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
