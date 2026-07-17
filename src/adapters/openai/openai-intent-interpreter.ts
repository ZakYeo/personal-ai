import type { AssistantContext } from "../../ports/assistant.js";
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

  start(text: string, context: AssistantContext): IntentInterpreterSession {
    const capabilityCatalog = this.options.capabilityCatalog ?? [];
    const toolNames = createOpenAIIntentToolNameMap(capabilityCatalog);
    let expectedContinuation: "tool_result" | "user_reply" | undefined;
    let pendingCallId: string | undefined;
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
        if (input && input.kind !== expectedContinuation) {
          throw new OpenAIIntentError(
            "OpenAI intent session received an unexpected continuation kind.",
          );
        }
        if (input?.kind === "tool_result" && input.callId !== pendingCallId) {
          throw new OpenAIIntentError(
            "OpenAI intent session tool result did not match the pending call.",
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
            )
          : createOpenAIIntentRequestBody(
              text,
              context,
              this.options.config,
              capabilityCatalog,
            );
        const response = await this.request(body);
        const parsed = parseOpenAIIntentSessionResponse(
          response,
          toolNames,
          text,
        );
        started = true;
        previousResponseId = parsed.responseId;
        expectedContinuation =
          parsed.interpretation.kind === "tool_call"
            ? "tool_result"
            : parsed.interpretation.kind === "clarification" ||
                parsed.interpretation.kind === "command" ||
                parsed.interpretation.kind === "plan"
              ? "user_reply"
              : undefined;
        pendingCallId =
          parsed.interpretation.kind === "tool_call"
            ? parsed.interpretation.call.id
            : undefined;
        return parsed.interpretation;
      },
    };
  }

  private async request(body: unknown): Promise<unknown> {
    return requestOpenAIResponse({
      body,
      config: this.options.config,
      createError: ({ cause, message, responseBody, status }) =>
        new OpenAIIntentError(message, status, responseBody, { cause }),
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
