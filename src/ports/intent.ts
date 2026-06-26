import type {
  AssistantCommand,
  AssistantContext,
  AssistantResponse,
} from "./assistant.js";

export interface IntentInterpretation {
  command?: AssistantCommand;
  response?: AssistantResponse;
}

export interface IntentInterpreterPort {
  interpret(
    text: string,
    context: AssistantContext,
  ): Promise<IntentInterpretation>;
}
