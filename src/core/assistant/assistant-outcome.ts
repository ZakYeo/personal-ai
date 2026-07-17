import type {
  AssistantDiagnostic,
  AssistantDiagnosticCategory,
  AssistantOutcome,
  AssistantResponse,
} from "../../ports/assistant.js";
import {
  createAppError,
  mapAppErrorToResponse,
  type AppError,
} from "./app-error.js";

export function outcomeFromError(
  error: AppError,
  response: AssistantResponse = mapAppErrorToResponse(error),
): AssistantOutcome {
  const outcome: AssistantOutcome = { response };
  if (diagnosticPolicy[error.category]) {
    outcome.diagnostics = [toAssistantDiagnostic(error)];
  }
  return outcome;
}

export function unexpectedOutcome(error: unknown): AssistantOutcome {
  return outcomeFromError(
    createAppError({
      category: "unexpected",
      cause: error,
      message: error instanceof Error ? error.message : "Unknown intent error",
    }),
  );
}

const diagnosticPolicy = {
  confirmation_required: false,
  conversation_failure: true,
  feature_failure: true,
  response_rewrite_failure: true,
  unexpected: true,
  unsupported: false,
  validation: false,
} as const satisfies Record<AssistantDiagnosticCategory, boolean>;

function toAssistantDiagnostic(error: AppError): AssistantDiagnostic {
  return {
    category: error.category,
    message: error.message,
    ...(error.capability ? { capability: error.capability } : {}),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  };
}
