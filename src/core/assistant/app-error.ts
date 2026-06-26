import type { AssistantResponse } from "../../ports/assistant.js";

export type AppErrorCategory =
  | "validation"
  | "confirmation_required"
  | "unsupported"
  | "feature_failure"
  | "unexpected";

export interface AppError {
  category: AppErrorCategory;
  message: string;
  capability?: string;
  cause?: unknown;
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
        text: `I could not complete that command: ${error.message}`,
      };
    case "unexpected":
      return {
        status: "error",
        text: "I hit a problem and could not complete that.",
      };
  }
}
