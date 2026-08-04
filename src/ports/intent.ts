import type {
  AssistantCommand,
  AssistantContext,
  AssistantResponse,
} from "./assistant.js";
import type { AssistantResultReference } from "./result-reference.js";
import type { ConversationState } from "./conversation.js";

export type IntentInterpretation =
  | {
      call: AssistantToolCall;
      kind: "tool_call";
    }
  | {
      clarification: IntentClarificationMetadata;
      kind: "clarification";
      response: AssistantResponse;
    }
  | {
      kind: "rephrase";
      response: AssistantResponse;
    }
  | {
      kind: "replacement";
    }
  | {
      kind: "plan";
      plan: ProposedAssistantPlan;
    }
  | {
      command: AssistantCommand;
      kind: "command";
    }
  | {
      kind: "conversation";
    }
  | {
      kind: "unknown";
      response: AssistantResponse;
    }
  | {
      kind: "unsupported";
      response: AssistantResponse;
    };

export interface ProposedAssistantPlan {
  commands: readonly AssistantCommand[];
}

export interface IntentInterpreterPort {
  start(
    text: string,
    context: AssistantContext,
    history?: ConversationState,
  ): IntentInterpreterSession;
}

export interface IntentInterpreterSession {
  next(input?: IntentSessionContinuation): Promise<IntentInterpretation>;
}

export interface IntentClarificationMetadata {
  readonly capability?: string;
  readonly origin: "intent_interpreter" | "semantic_validation";
  readonly session: "restart" | "resume";
}

export interface IntentClarificationContext {
  readonly capability?: string;
  readonly origin:
    | IntentClarificationMetadata["origin"]
    | "feature_validation"
    | "feature_execution";
  readonly originalText: string;
  readonly parameter?: string;
  readonly prompt: string;
  readonly session: IntentClarificationMetadata["session"];
}

export interface AssistantToolCall {
  readonly command: AssistantCommand;
  readonly id: string;
}

export interface AssistantToolObservation {
  readonly capability: string;
  readonly data?: Readonly<AssistantCommand["parameters"]>;
  readonly resultReferences?: readonly AssistantResultReference[];
  readonly text: string;
}

export type IntentSessionContinuation =
  | {
      readonly callId: string;
      readonly kind: "tool_result";
      readonly observation: AssistantToolObservation;
    }
  | {
      readonly clarification: IntentClarificationContext;
      readonly kind: "user_reply";
      readonly text: string;
    };
