import type { AssistantResultReference } from "./result-reference.js";

export type AssistantResponseStatus =
  | "ok"
  | "unknown"
  | "unsupported"
  | "invalid"
  | "needs_confirmation"
  | "error";

export interface AssistantResponse {
  status: AssistantResponseStatus;
  text: string;
  expectsFollowUp?: boolean;
}

export function assistantResponseExpectsFollowUp(
  response: AssistantResponse,
): boolean {
  return response.expectsFollowUp === true;
}

export type AssistantDiagnosticCategory =
  | "validation"
  | "confirmation_required"
  | "unsupported"
  | "feature_failure"
  | "response_rewrite_failure"
  | "conversation_failure"
  | "unexpected";

export interface AssistantDiagnostic {
  category: AssistantDiagnosticCategory;
  message: string;
  capability?: string;
  cause?: unknown;
}

export interface AssistantOutcome {
  response: AssistantResponse;
  diagnostics?: AssistantDiagnostic[];
  plan?: AssistantPlanOutcome;
}

export interface AssistantPlanOutcome {
  steps: readonly AssistantPlanStepOutcome[];
}

export interface AssistantPlanStepOutcome {
  capability: string;
  data?: AssistantCommandParameters;
  diagnostics?: AssistantDiagnostic[];
  response?: AssistantResponse;
  status: "succeeded" | "failed" | "skipped";
}

export type AssistantCommandParameters = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface ConfirmationDeclaration {
  facts: AssistantCommandParameters;
  text: string;
}

export interface AssistantCommand {
  capability: string;
  parameters: AssistantCommandParameters;
  rawText: string;
}

export interface AssistantPolicyConfig {
  assistant: {
    name: string;
    timeZone: string;
    wakePhrases: string[];
  };
  features: Record<
    string,
    {
      enabled: boolean;
      confirmationRequiredCapabilities?: string[];
    }
  >;
}

export interface AssistantContext {
  config: AssistantPolicyConfig;
  clock: ClockPort;
  resultReferences?: readonly AssistantResultReference[];
}

export interface ClockPort {
  now(): Date;
}
