export interface OpenAIResponsesInputText {
  readonly text: string;
  readonly type: "input_text";
}

export interface OpenAIResponsesAssistantMessage {
  readonly content: string;
  readonly role: "assistant";
}

export interface OpenAIResponsesPromptMessage {
  readonly content: string | readonly OpenAIResponsesInputText[];
  readonly role: "developer" | "system" | "user";
}

interface OpenAIResponsesFunctionCallOutput {
  readonly call_id: string;
  readonly output: string;
  readonly type: "function_call_output";
}

export type OpenAIResponsesInputItem =
  | OpenAIResponsesAssistantMessage
  | OpenAIResponsesFunctionCallOutput
  | OpenAIResponsesPromptMessage;

export interface OpenAIResponsesRequestBody {
  readonly [property: string]: unknown;
  readonly input: string | readonly OpenAIResponsesInputItem[];
  readonly model: string;
}
