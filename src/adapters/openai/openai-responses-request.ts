import type { OpenAIReasoningEffort } from "./openai-responses-config.js";

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

export type OpenAIResponsesJsonValue =
  | boolean
  | null
  | number
  | OpenAIResponsesJsonObject
  | readonly OpenAIResponsesJsonValue[]
  | string;

export interface OpenAIResponsesJsonObject {
  readonly [property: string]: OpenAIResponsesJsonValue;
}

interface OpenAIResponsesRequestBase<TInput> {
  readonly input: TInput;
  readonly model: string;
  readonly reasoning?: {
    readonly effort: OpenAIReasoningEffort;
  };
}

interface OpenAIResponsesJsonSchemaOutput {
  readonly text: {
    readonly format: {
      readonly name: string;
      readonly schema: OpenAIResponsesJsonObject;
      readonly strict: true;
      readonly type: "json_schema";
    };
  };
}

export interface OpenAIResponsesFunctionTool {
  readonly description: string;
  readonly name: string;
  readonly parameters: OpenAIResponsesJsonObject;
  readonly strict: true;
  readonly type: "function";
}

export type OpenAIConversationRequestBody = OpenAIResponsesRequestBase<
  readonly OpenAIResponsesInputItem[]
> &
  OpenAIResponsesJsonSchemaOutput;

export type OpenAIResponseRewriteRequestBody = OpenAIResponsesRequestBase<
  readonly OpenAIResponsesInputItem[]
> &
  OpenAIResponsesJsonSchemaOutput;

export type OpenAIWeatherClothingAdviceRequestBody = OpenAIResponsesRequestBase<
  readonly OpenAIResponsesInputItem[]
> &
  OpenAIResponsesJsonSchemaOutput;

export type OpenAIIntentRequestBody = OpenAIResponsesRequestBase<
  readonly OpenAIResponsesInputItem[]
> &
  OpenAIResponsesJsonSchemaOutput & {
    readonly parallel_tool_calls?: false;
    readonly tools?: readonly OpenAIResponsesFunctionTool[];
  };

export type OpenAIIntentContinuationRequestBody = OpenAIResponsesRequestBase<
  readonly OpenAIResponsesInputItem[]
> &
  OpenAIResponsesJsonSchemaOutput & {
    readonly instructions: string;
    readonly parallel_tool_calls: false;
    readonly previous_response_id: string;
    readonly tools: readonly OpenAIResponsesFunctionTool[];
  };

export type OpenAIWebSearchRequestBody = OpenAIResponsesRequestBase<string> & {
  readonly tool_choice: "required";
  readonly tools: readonly {
    readonly search_context_size: "low";
    readonly type: "web_search";
  }[];
};

export type OpenAIResponsesRequestBody =
  | OpenAIConversationRequestBody
  | OpenAIIntentContinuationRequestBody
  | OpenAIIntentRequestBody
  | OpenAIResponseRewriteRequestBody
  | OpenAIWeatherClothingAdviceRequestBody
  | OpenAIWebSearchRequestBody;
