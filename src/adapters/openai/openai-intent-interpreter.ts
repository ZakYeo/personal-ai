import type { AssistantContext } from "../../ports/assistant.js";
import type { ConversationState } from "../../ports/conversation.js";
import type {
  IntentInterpreterSession,
  IntentSessionContinuation,
  IntentInterpreterPort,
} from "../../ports/intent.js";
import { OpenAIIntentError } from "./openai-intent-error.js";
import type { OpenAIResponsesConfig } from "./openai-responses-config.js";
import {
  createOpenAIIntentContinuationRequestBody,
  createOpenAIIntentRequestBody,
  createOpenAIIntentToolNameMap,
} from "./openai-intent-request.js";
import type { OpenAIIntentCapability } from "./openai-intent-request.js";
import { requestOpenAIResponse } from "./openai-responses-client.js";
import type {
  OpenAIIntentContinuationRequestBody,
  OpenAIIntentRequestBody,
} from "./openai-responses-request.js";
import { parseOpenAIIntentSessionResponse } from "./openai-intent-session-response.js";

export { OpenAIIntentError } from "./openai-intent-error.js";
export type { OpenAIIntentCapability } from "./openai-intent-request.js";

interface OpenAIIntentInterpreterOptions {
  capabilityCatalog?: readonly OpenAIIntentCapability[];
  config: OpenAIResponsesConfig;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

export class OpenAIIntentInterpreter implements IntentInterpreterPort {
  constructor(private readonly options: OpenAIIntentInterpreterOptions) {}

  start(
    text: string,
    context: AssistantContext,
    history: ConversationState = { recentTurns: [] },
  ): IntentInterpreterSession {
    const capabilityCatalog = this.options.capabilityCatalog ?? [];
    const toolNames = createOpenAIIntentToolNameMap(capabilityCatalog);
    let previousResponseId: string | undefined;
    let started = false;

    return {
      next: async (input?: IntentSessionContinuation) => {
        if (!started && input) {
          throw new OpenAIIntentError(
            "OpenAI intent session cannot be continued before it starts.",
          );
        }
        if (started && !input) {
          throw new OpenAIIntentError(
            "OpenAI intent session continuation input is required.",
          );
        }
        const body = input
          ? createOpenAIIntentContinuationRequestBody(
              input.kind === "tool_result"
                ? {
                    callId: input.callId,
                    kind: "tool_result",
                    output: JSON.stringify(input.observation),
                  }
                : input,
              requirePreviousResponseId(previousResponseId),
              context,
              this.options.config,
              capabilityCatalog,
              history,
            )
          : createOpenAIIntentRequestBody(
              text,
              context,
              this.options.config,
              capabilityCatalog,
              undefined,
              history,
            );
        const response = await this.request(body);
        const parsed = parseOpenAIIntentSessionResponse(
          response,
          toolNames,
          input?.kind === "user_reply" ? input.text : text,
        );
        const interpretation = parsed.interpretation;
        started = true;
        previousResponseId = parsed.responseId;
        return interpretation;
      },
    };
  }

  private async request(
    body: OpenAIIntentContinuationRequestBody | OpenAIIntentRequestBody,
  ): Promise<unknown> {
    return requestOpenAIResponse({
      body,
      config: this.options.config,
      createError: ({ cause, message, requestId, responseBody, status }) =>
        new OpenAIIntentError(message, status, responseBody, {
          cause,
          ...(requestId ? { requestId } : {}),
        }),
      env: this.options.env,
      fetch: this.options.fetch,
      operation: "intent",
    });
  }
}

function requirePreviousResponseId(value: string | undefined): string {
  if (!value) {
    throw new OpenAIIntentError(
      "OpenAI intent session cannot continue without a previous response id.",
    );
  }
  return value;
}
