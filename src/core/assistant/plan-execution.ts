import type {
  AssistantCommandParameters,
  AssistantOutcome,
} from "../../ports/assistant.js";
import type {
  ValidatedAssistantPlan,
  ValidatedAssistantPlanStep,
} from "../../ports/assistant-plan.js";

export interface CommandExecutionOutcome {
  data?: AssistantCommandParameters;
  outcome: AssistantOutcome;
}

export async function executeAssistantPlan(
  plan: ValidatedAssistantPlan,
  executeStep: (
    step: ValidatedAssistantPlanStep,
  ) => Promise<CommandExecutionOutcome>,
): Promise<AssistantOutcome> {
  if (plan.kind === "single") {
    return (await executeStep(plan.steps[0]!)).outcome;
  }

  const stepOutcomes: NonNullable<AssistantOutcome["plan"]>["steps"][number][] =
    [];
  let failed = false;

  for (const step of plan.steps) {
    if (failed) {
      stepOutcomes.push({
        capability: step.command.capability,
        status: "skipped",
      });
      continue;
    }

    const execution = await executeStep(step);
    const succeeded = execution.outcome.response.status === "ok";
    failed = !succeeded;
    stepOutcomes.push({
      capability: step.command.capability,
      ...(execution.data ? { data: execution.data } : {}),
      ...(execution.outcome.diagnostics
        ? { diagnostics: execution.outcome.diagnostics }
        : {}),
      response: execution.outcome.response,
      status: succeeded ? "succeeded" : "failed",
    });
  }

  return composePlanOutcome(plan, stepOutcomes);
}

function composePlanOutcome(
  plan: ValidatedAssistantPlan,
  stepOutcomes: NonNullable<AssistantOutcome["plan"]>["steps"],
): AssistantOutcome {
  const completedText = stepOutcomes
    .flatMap((step) =>
      step.status === "succeeded" && step.response ? [step.response.text] : [],
    )
    .join(" ");
  const failedIndex = stepOutcomes.findIndex(
    (step) => step.status === "failed",
  );
  const failedStep = stepOutcomes[failedIndex];
  const skippedActions = stepOutcomes.flatMap((step, index) =>
    step.status === "skipped" ? [formatPlanAction(plan.steps[index]!)] : [],
  );
  const response = failedStep
    ? {
        status: "error" as const,
        text: [
          completedText,
          `I could not complete this step: ${formatPlanAction(plan.steps[failedIndex]!)}.`,
          skippedActions.length > 0
            ? `I did not attempt ${skippedActions.length === 1 ? "this remaining step" : "these remaining steps"}: ${skippedActions.join("; ")}.`
            : undefined,
        ]
          .filter((part): part is string => Boolean(part))
          .join(" "),
      }
    : {
        ...(stepOutcomes.some((step) => step.response?.expectsFollowUp === true)
          ? { expectsFollowUp: true }
          : {}),
        status: "ok" as const,
        text: completedText,
      };
  const diagnostics = stepOutcomes.flatMap((step) => step.diagnostics ?? []);

  return {
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    plan: { steps: stepOutcomes },
    response,
  };
}

function formatPlanAction(step: ValidatedAssistantPlanStep): string {
  return (
    step.route.capability.summary?.replace(/\.$/u, "") ??
    step.route.feature.displayName
  );
}
