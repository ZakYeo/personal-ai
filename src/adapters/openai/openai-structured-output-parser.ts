interface OpenAIStructuredOutputErrorOptions {
  cause: unknown;
  message: string;
  responseBody: string;
}

interface ParseOpenAIStructuredOutputOptions {
  createError(options: OpenAIStructuredOutputErrorOptions): Error;
  invalidJsonMessage: string;
}

interface ParseValidatedOpenAIStructuredOutputOptions<
  T,
> extends ParseOpenAIStructuredOutputOptions {
  invalidOutputMessage: string;
  validate(value: unknown): T;
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

export function parseValidatedOpenAIStructuredOutput<T>(
  value: string,
  options: ParseValidatedOpenAIStructuredOutputOptions<T>,
): T {
  const parsed = parseOpenAIStructuredOutput(value, options);
  try {
    return options.validate(parsed);
  } catch (cause) {
    throw options.createError({
      cause,
      message:
        cause instanceof Error ? cause.message : options.invalidOutputMessage,
      responseBody: value,
    });
  }
}
