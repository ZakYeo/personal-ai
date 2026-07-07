interface OpenAIVoiceProviderErrorOptions {
  cause?: unknown;
  event?: unknown;
  message: string;
  responseBody?: string;
  status?: number;
}

export class OpenAIVoiceProviderError extends Error {
  readonly event?: unknown;
  readonly responseBody?: string;
  readonly status?: number;

  constructor(options: OpenAIVoiceProviderErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "OpenAIVoiceProviderError";
    this.event = options.event;
    this.responseBody = options.responseBody;
    this.status = options.status;
  }
}

export function createOpenAIVoiceProviderError(
  options: OpenAIVoiceProviderErrorOptions,
): OpenAIVoiceProviderError {
  return new OpenAIVoiceProviderError(options);
}
