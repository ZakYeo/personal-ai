import { parseWeatherClothingAdvice } from "../../application/weather-clothing-advice-policy.js";
import type {
  WeatherClothingAdvice,
  WeatherClothingAdviceGoal,
} from "../../ports/weather-clothing-advisor.js";
import { parseValidatedOpenAIStructuredOutput } from "./openai-structured-output-parser.js";
import { OpenAIWeatherClothingAdvisorError } from "./openai-weather-clothing-advisor-error.js";

export function parseOpenAIWeatherClothingAdvice(
  value: string,
  goal: WeatherClothingAdviceGoal["kind"],
): WeatherClothingAdvice {
  return parseValidatedOpenAIStructuredOutput(value, {
    createError: ({ cause, message, responseBody }) =>
      new OpenAIWeatherClothingAdvisorError(message, undefined, responseBody, {
        cause,
      }),
    invalidJsonMessage:
      "OpenAI weather clothing advice response was not valid JSON.",
    invalidOutputMessage:
      "OpenAI weather clothing advice response was invalid.",
    validate: (parsed) => parseWeatherClothingAdvice(parsed, goal),
  });
}
