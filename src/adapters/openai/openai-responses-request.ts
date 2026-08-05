interface OpenAIResponsesInputText {
  readonly text: string;
  readonly type: "input_text";
}

export interface OpenAIResponsesPlainTextMessage {
  readonly content: string;
  readonly role: "assistant" | "developer" | "system" | "user";
}

interface OpenAIResponsesStructuredInputMessage {
  readonly content: readonly OpenAIResponsesInputText[];
  readonly role: "developer" | "system" | "user";
}

interface OpenAIResponsesFunctionCallOutput {
  readonly call_id: string;
  readonly output: string;
  readonly type: "function_call_output";
}

export type OpenAIResponsesInputItem =
  | OpenAIResponsesFunctionCallOutput
  | OpenAIResponsesPlainTextMessage
  | OpenAIResponsesStructuredInputMessage;

export interface OpenAIResponsesRequestBody {
  readonly [property: string]: unknown;
  readonly input: string | readonly OpenAIResponsesInputItem[];
  readonly model: string;
}
