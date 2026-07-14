import type { AssistantOutcome } from "../../ports/assistant.js";
import type { ValidatedAssistantPlan } from "../../ports/assistant-plan.js";

export function planRequiresConfirmation(
  plan: ValidatedAssistantPlan,
): boolean {
  return plan.steps.some((step) => step.confirmation.required);
}

export function createPlanConfirmationPrompt(
  plan: ValidatedAssistantPlan,
): AssistantOutcome {
  const actions = plan.steps
    .flatMap((step) =>
      step.confirmation.required ? [step.confirmation.declaration] : [],
    )
    .map((declaration, index) => `${index + 1}. ${declaration.text}.`)
    .join(" ");

  return {
    response: {
      expectsFollowUp: true,
      status: "needs_confirmation",
      text: `${plan.kind === "compound" ? "Please confirm this plan" : "Please confirm"}: ${actions} Say yes or no.`,
    },
  };
}
