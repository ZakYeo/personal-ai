import { ProviderDiagnosticError } from "../provider-diagnostic-error.js";

interface OpenAIVoiceProviderErrorOptions {
  cause?: unknown;
  event?: unknown;
  message: string;
  responseBody?: string;
  requestId?: string;
  status?: number;
}

class OpenAIVoiceProviderError extends ProviderDiagnosticError {
  readonly event?: unknown;

  constructor(options: OpenAIVoiceProviderErrorOptions) {
    super(options.message, options.status, options.responseBody, {
      cause: options.cause,
      ...(options.requestId ? { requestId: options.requestId } : {}),
    });
    this.name = "OpenAIVoiceProviderError";
    this.event = options.event;
  }
}

export function createOpenAIVoiceProviderError(
  options: OpenAIVoiceProviderErrorOptions,
): OpenAIVoiceProviderError {
  return new OpenAIVoiceProviderError(options);
}
