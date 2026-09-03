import {
  ProviderDiagnosticError,
  type ProviderDiagnosticErrorOptions,
} from "../provider-diagnostic-error.js";

export class OpenAIConversationError extends ProviderDiagnosticError {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string,
    options?: ProviderDiagnosticErrorOptions,
  ) {
    super(message, status, responseBody, options);
    this.name = "OpenAIConversationError";
  }
}
