export class OpenAIConversationError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OpenAIConversationError";
  }
}
