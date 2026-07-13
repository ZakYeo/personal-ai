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
import { fetchOpenAIResponse } from "./openai-responses-client.js";

export { OpenAIIntentError } from "./openai-intent-error.js";
export type { OpenAIIntentCapability } from "./openai-intent-request.js";

interface OpenAIIntentInterpreterOptions {
  capabilityCatalog?: OpenAIIntentCapability[];
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
    const apiKey = this.options.env[this.options.config.apiKeyEnv];

    if (!apiKey) {
      throw new OpenAIIntentError(
        `OpenAI API key environment variable ${this.options.config.apiKeyEnv} is not set.`,
      );
    }

    const response = await fetchOpenAIResponse({
      apiKey,
      body: createOpenAIIntentRequestBody(
        text,
        context,
        this.options.config,
        this.options.capabilityCatalog ?? [],
      ),
      config: this.options.config,
      fetch: this.options.fetch,
    });
    const outputText = extractOpenAIOutputText(response);

    return parseOpenAIIntentOutput(outputText);
  }
}
