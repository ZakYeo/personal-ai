import type {
  AssistantCommand,
  AssistantContext,
  AssistantResponse,
} from "./assistant.js";

export interface ResponseRewriteRequest {
  capability: string;
  command: AssistantCommand;
  originalText: string;
  protectedFacts?: readonly ProtectedResponseFact[];
  response: AssistantResponse;
}

export interface ProtectedResponseFact {
  names: readonly string[];
  spokenForm?: "date" | "date_time" | "time" | "time_zone";
  token: string;
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
