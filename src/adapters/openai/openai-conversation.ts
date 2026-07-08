import type {
  AssistantContext,
  OpenAIIntentConfig,
} from "../../ports/assistant.js";
import type {
  ConversationCompactorPort,
  ConversationResponderPort,
  ConversationState,
} from "../../ports/conversation.js";
import { fetchProviderJson, trimTrailingSlash } from "../http-json-client.js";
import { extractOpenAIOutputText } from "./openai-output-extractor.js";
import { OpenAIConversationError } from "./openai-conversation-error.js";
import {
  createOpenAIConversationCompactionRequestBody,
  createOpenAIConversationRequestBody,
} from "./openai-conversation-request.js";
import {
  parseOpenAIConversationResponse,
  parseOpenAIConversationSummary,
} from "./openai-conversation-output-parser.js";

interface OpenAIConversationOptions {
  config: OpenAIIntentConfig;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

export class OpenAIConversationResponder implements ConversationResponderPort {
  constructor(private readonly options: OpenAIConversationOptions) {}

  async respond(
    input: string,
    state: ConversationState,
    context: AssistantContext,
  ) {
    const outputText = await fetchConversationOutputText({
      body: createOpenAIConversationRequestBody(
        input,
        state,
        context,
        this.options.config,
      ),
      options: this.options,
    });

    return {
      status: "ok" as const,
      text: parseOpenAIConversationResponse(outputText),
    };
  }
}

export class OpenAIConversationCompactor implements ConversationCompactorPort {
  constructor(private readonly options: OpenAIConversationOptions) {}

  async compact(state: ConversationState, context: AssistantContext) {
    const outputText = await fetchConversationOutputText({
      body: createOpenAIConversationCompactionRequestBody(
        state,
        context,
        this.options.config,
      ),
      options: this.options,
    });

    return {
      recentTurns: [],
      summary: parseOpenAIConversationSummary(outputText),
    };
  }
}

async function fetchConversationOutputText(input: {
  body: unknown;
  options: OpenAIConversationOptions;
}): Promise<string> {
  const apiKey = input.options.env[input.options.config.apiKeyEnv];

  if (!apiKey) {
    throw new OpenAIConversationError(
      `OpenAI API key environment variable ${input.options.config.apiKeyEnv} is not set.`,
    );
  }

  const response = await fetchProviderJson({
    createError: ({ cause, message, responseBody, status }) =>
      new OpenAIConversationError(message, status, responseBody, { cause }),
    fetch: input.options.fetch,
    invalidJsonMessage: "OpenAI conversation response body was not valid JSON.",
    nonOkMessage: (status) =>
      `OpenAI conversation request failed with status ${status}.`,
    request: {
      body: JSON.stringify(input.body),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
    },
    timeoutMessage: `OpenAI conversation request timed out after ${input.options.config.timeoutMs}ms.`,
    timeoutMs: input.options.config.timeoutMs,
    url: `${trimTrailingSlash(input.options.config.baseUrl)}/responses`,
  });

  return extractOpenAIOutputText(response, {
    createError: (message) => new OpenAIConversationError(message),
    missingMessage: "OpenAI conversation response did not include output text.",
    notObjectMessage: "OpenAI conversation response body must be an object.",
  });
}
