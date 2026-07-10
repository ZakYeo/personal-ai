import type {
  AssistantCommand,
  AssistantContext,
  AssistantResponse,
} from "./assistant.js";

export interface ResponseRewriteRequest {
  capability: string;
  command: AssistantCommand;
  originalText: string;
  response: AssistantResponse;
}

export interface ResponseRewriteResult {
  text: string;
}

export interface ResponseRewriterPort {
  rewrite(
    request: ResponseRewriteRequest,
    context: AssistantContext,
  ): Promise<ResponseRewriteResult>;
}
