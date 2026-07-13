import type { AssistantContext } from "../../ports/assistant.js";
import type {
  IntentInterpretation,
  IntentInterpreterPort,
} from "../../ports/intent.js";
import { OpenAIIntentError } from "./openai-intent-error.js";
import type { OpenAIResponsesConfig } from "./openai-responses-config.js";
import { parseOpenAIIntentOutput } from "./openai-intent-output-parser.js";
import { createOpenAIIntentRequestBody } from "./openai-intent-request.js";
import type { OpenAIIntentCapability } from "./openai-intent-request.js";
import { extractOpenAIOutputText } from "./openai-output-extractor.js";
import { requestOpenAIResponse } from "./openai-responses-client.js";

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

  async interpret(
    text: string,
    context: AssistantContext,
  ): Promise<IntentInterpretation> {
    const response = await requestOpenAIResponse({
      body: createOpenAIIntentRequestBody(
        text,
        context,
        this.options.config,
        this.options.capabilityCatalog ?? [],
      ),
      config: this.options.config,
      createError: ({ cause, message, responseBody, status }) =>
        new OpenAIIntentError(message, status, responseBody, { cause }),
      env: this.options.env,
      fetch: this.options.fetch,
      operation: "intent",
    });
    const outputText = extractOpenAIOutputText(response);

    return parseOpenAIIntentOutput(outputText);
  }
}
