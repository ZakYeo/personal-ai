import type {
  WeatherClothingAdvice,
  WeatherClothingAdviceRequest,
  WeatherClothingAdvisorPort,
} from "../../ports/weather-clothing-advisor.js";
import { extractOpenAIOutputText } from "./openai-output-extractor.js";
import type { OpenAIResponsesConfig } from "./openai-responses-config.js";
import { requestOpenAIResponse } from "./openai-responses-client.js";
import { OpenAIWeatherClothingAdvisorError } from "./openai-weather-clothing-advisor-error.js";
import { parseOpenAIWeatherClothingAdvice } from "./openai-weather-clothing-advisor-parser.js";
import { createOpenAIWeatherClothingAdviceRequestBody } from "./openai-weather-clothing-advisor-request.js";

interface OpenAIWeatherClothingAdvisorOptions {
  config: OpenAIResponsesConfig;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

export class OpenAIWeatherClothingAdvisor implements WeatherClothingAdvisorPort {
  constructor(private readonly options: OpenAIWeatherClothingAdvisorOptions) {}

  async advise(
    request: WeatherClothingAdviceRequest,
    requestOptions: { readonly signal?: AbortSignal } = {},
  ): Promise<WeatherClothingAdvice> {
    const response = await requestOpenAIResponse({
      body: createOpenAIWeatherClothingAdviceRequestBody(
        request,
        this.options.config,
      ),
      cancelledMessage: "OpenAI weather clothing advice request was cancelled.",
      config: this.options.config,
      createError: ({ cause, message, responseBody, status }) =>
        new OpenAIWeatherClothingAdvisorError(message, status, responseBody, {
          cause,
        }),
      env: this.options.env,
      fetch: this.options.fetch,
      operation: "weather clothing advice",
      ...(requestOptions.signal ? { signal: requestOptions.signal } : {}),
    });
    const output = extractOpenAIOutputText(response, {
      createError: (message) => new OpenAIWeatherClothingAdvisorError(message),
      missingMessage:
        "OpenAI weather clothing advice response did not include output text.",
      notObjectMessage:
        "OpenAI weather clothing advice response body must be an object.",
    });
    return parseOpenAIWeatherClothingAdvice(output, request.goal.kind);
  }
}

export { OpenAIWeatherClothingAdvisorError } from "./openai-weather-clothing-advisor-error.js";
