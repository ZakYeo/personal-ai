import type {
  AssistantCommand,
  AssistantContext,
  AssistantResponse,
} from "./assistant.js";
import type { AssistantResultReference } from "./result-reference.js";

export type IntentInterpretation =
  | {
      call: AssistantToolCall;
      kind: "tool_call";
    }
  | {
      kind: "clarification";
      response: AssistantResponse;
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
  start?(text: string, context: AssistantContext): IntentInterpreterSession;
  interpret(
    text: string,
    context: AssistantContext,
  ): Promise<IntentInterpretation>;
}

export interface IntentInterpreterSession {
  next(input?: IntentSessionContinuation): Promise<IntentInterpretation>;
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
      readonly kind: "user_reply";
      readonly text: string;
    };
