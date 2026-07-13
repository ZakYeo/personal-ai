import type { AssistantContext } from "../../ports/assistant.js";
import type {
  ConversationCompactorPort,
  ConversationResponderPort,
  ConversationState,
} from "../../ports/conversation.js";
import { extractOpenAIOutputText } from "./openai-output-extractor.js";
import { OpenAIConversationError } from "./openai-conversation-error.js";
import type { OpenAIResponsesConfig } from "./openai-responses-config.js";
import { requestOpenAIResponse } from "./openai-responses-client.js";
import {
  createOpenAIConversationCompactionRequestBody,
  createOpenAIConversationRequestBody,
} from "./openai-conversation-request.js";
import type { OpenAIIntentCapability } from "./openai-intent-request.js";
import {
  parseOpenAIConversationResponse,
  parseOpenAIConversationSummary,
} from "./openai-conversation-output-parser.js";

interface OpenAIConversationOptions {
  capabilityCatalog?: readonly OpenAIIntentCapability[];
  config: OpenAIResponsesConfig;
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
        this.options.capabilityCatalog ?? [],
      ),
      options: this.options,
    });

    return {
      ...parseOpenAIConversationResponse(outputText),
      status: "ok" as const,
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
  const response = await requestOpenAIResponse({
    body: input.body,
    config: input.options.config,
    createError: ({ cause, message, responseBody, status }) =>
      new OpenAIConversationError(message, status, responseBody, { cause }),
    env: input.options.env,
    fetch: input.options.fetch,
    operation: "conversation",
  });

  return extractOpenAIOutputText(response, {
    createError: (message) => new OpenAIConversationError(message),
    missingMessage: "OpenAI conversation response did not include output text.",
    notObjectMessage: "OpenAI conversation response body must be an object.",
  });
}
