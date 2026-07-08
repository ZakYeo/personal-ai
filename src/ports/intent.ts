import type {
  AssistantCommand,
  AssistantContext,
  AssistantResponse,
} from "./assistant.js";

export type IntentInterpretation =
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

export interface IntentInterpreterPort {
  interpret(
    text: string,
    context: AssistantContext,
  ): Promise<IntentInterpretation>;
}
