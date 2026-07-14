import type {
  AssistantCommand,
  AssistantContext,
  AssistantResponse,
} from "./assistant.js";

export type IntentInterpretation =
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
  interpret(
    text: string,
    context: AssistantContext,
  ): Promise<IntentInterpretation>;
}
