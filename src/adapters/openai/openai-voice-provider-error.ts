interface OpenAIVoiceProviderErrorOptions {
  cause?: unknown;
  event?: unknown;
  message: string;
  responseBody?: string;
  status?: number;
}

class OpenAIVoiceProviderError extends Error {
  readonly event?: unknown;
  readonly responseBody?: string;
  readonly status?: number;

  constructor(options: OpenAIVoiceProviderErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "OpenAIVoiceProviderError";
    this.event = options.event;
    if (options.responseBody !== undefined) {
      this.responseBody = options.responseBody;
    }
    if (options.status !== undefined) {
      this.status = options.status;
    }
  }
}

export function createOpenAIVoiceProviderError(
  options: OpenAIVoiceProviderErrorOptions,
): OpenAIVoiceProviderError {
  return new OpenAIVoiceProviderError(options);
}
