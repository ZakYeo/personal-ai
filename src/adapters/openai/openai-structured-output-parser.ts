interface OpenAIStructuredOutputErrorOptions {
  cause: unknown;
  message: string;
  responseBody: string;
}

interface ParseOpenAIStructuredOutputOptions {
  createError(options: OpenAIStructuredOutputErrorOptions): Error;
  invalidJsonMessage: string;
}

export function parseOpenAIStructuredOutput(
  value: string,
  options: ParseOpenAIStructuredOutputOptions,
): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (cause) {
    throw options.createError({
      cause,
      message: options.invalidJsonMessage,
      responseBody: value,
    });
  }
}
