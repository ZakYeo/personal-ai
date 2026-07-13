import type {
  AssistantDiagnosticCategory,
  AssistantResponse,
} from "../../ports/assistant.js";

export type AppErrorCategory = AssistantDiagnosticCategory;

export interface AppError {
  category: AppErrorCategory;
  message: string;
  capability?: string;
  cause?: unknown;
  publicMessage?: string;
}

export function createAppError(error: AppError): AppError {
  return error;
}

export function mapAppErrorToResponse(error: AppError): AssistantResponse {
  switch (error.category) {
    case "validation":
      return {
        status: "invalid",
        text: `I could not use that command: ${error.message}`,
      };
    case "confirmation_required":
      return {
        status: "needs_confirmation",
        text: "I need confirmation before doing that. Please confirm yes or no.",
      };
    case "unsupported":
      return {
        status: "unsupported",
        text: error.capability
          ? `I do not have an enabled feature for ${error.capability}.`
          : error.message,
      };
    case "feature_failure":
      return {
        status: "error",
        text: error.publicMessage ?? "I could not complete that command.",
      };
    case "response_rewrite_failure":
      return {
        status: "error",
        text: error.publicMessage ?? "I could not prepare that response.",
      };
    case "conversation_failure":
      return {
        status: "error",
        text: error.publicMessage ?? "I could not answer that right now.",
      };
    case "unexpected":
      return {
        status: "error",
        text: "I hit a problem and could not complete that.",
      };
  }
}
