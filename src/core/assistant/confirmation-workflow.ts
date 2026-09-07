import type {
  AssistantCommand,
  AssistantOutcome,
} from "../../ports/assistant.js";
import type { ValidatedAssistantPlan } from "../../ports/assistant-plan.js";
import type {
  IntentDraftSnapshot,
  IntentInterpretation,
} from "../../ports/intent.js";
import { outcomeFromError, unexpectedOutcome } from "./assistant-outcome.js";
import {
  type createClarificationDraft,
  expiredDraftOutcome,
} from "./clarification-draft.js";
import type {
  ClarificationResolution,
  InteractionSession,
} from "./interaction-session.js";
import { createPlanConfirmationPrompt } from "./plan-confirmation.js";
import { applyPlanCorrection } from "./plan-correction.js";
import type { validateAssistantPlan } from "./plan-validation.js";

interface ConfirmationWorkflow {
  draft: ReturnType<typeof createClarificationDraft>;
  interaction: InteractionSession;
  references(): readonly string[];
  decorate(outcome: AssistantOutcome): AssistantOutcome;
  execute(
    plan: ValidatedAssistantPlan,
    signal?: AbortSignal,
  ): Promise<AssistantOutcome>;
  next(
    reply: string,
    context: { draft: IntentDraftSnapshot; prompt: string; parameter?: string },
    signal?: AbortSignal,
  ): Promise<IntentInterpretation>;
  validate(
    commands: readonly AssistantCommand[],
    kind: ValidatedAssistantPlan["kind"],
  ): ReturnType<typeof validateAssistantPlan>;
  limitOutcome: AssistantOutcome;
}

export function requestWorkflowConfirmation(
  input: ConfirmationWorkflow,
  plan: ValidatedAssistantPlan,
): AssistantOutcome {
  if (
    !input.draft.openPlan(
      plan.steps.map((step) => step.command),
      input.references(),
    )
  )
    return input.decorate(
      input.draft.expired() ? expiredDraftOutcome : input.limitOutcome,
    );
  const prompt = input.decorate(createPlanConfirmationPrompt(plan));
  return input.interaction.requestConfirmation(
    plan,
    prompt,
    (prepared, signal) =>
      input.draft.expired()
        ? Promise.resolve(input.decorate(expiredDraftOutcome))
        : input.execute(prepared, signal),
    revise(prompt.response.text),
  );

  function revise(promptText: string, parameter?: string) {
    return async (
      reply: string,
      signal?: AbortSignal,
    ): Promise<ClarificationResolution> => {
      const completed = (
        outcome: AssistantOutcome,
      ): ClarificationResolution => ({
        kind: "completed",
        outcome: input.decorate(outcome),
      });
      if (!input.draft.takeReply())
        return completed(
          input.draft.expired() ? expiredDraftOutcome : input.limitOutcome,
        );
      try {
        signal?.throwIfAborted();
        const interpretation = await input.next(
          reply,
          {
            draft: Object.freeze({
              ...input.draft.snapshot(),
              ...(parameter
                ? { missingParameters: Object.freeze([parameter]) }
                : {}),
            }),
            prompt: promptText,
            ...(parameter ? { parameter } : {}),
          },
          signal,
        );
        signal?.throwIfAborted();
        if (input.draft.expired()) return completed(expiredDraftOutcome);
        if (
          interpretation.kind === "replacement" ||
          interpretation.kind === "conversation"
        )
          return { kind: "replacement" };
        if (
          interpretation.kind === "rephrase" ||
          interpretation.kind === "clarification"
        ) {
          if (input.draft.snapshot().remainingReplies === 0)
            return completed(input.limitOutcome);
          const metadata =
            interpretation.kind === "clarification"
              ? interpretation.clarification
              : undefined;
          if (
            metadata &&
            !plan.steps.some(
              (step) => step.command.capability === metadata.capability,
            )
          )
            throw new Error(
              "A correction question changed the selected capability.",
            );
          const nextParameter =
            metadata && "parameter" in metadata
              ? metadata.parameter
              : undefined;
          if (
            nextParameter &&
            !plan.steps.some(
              (step) =>
                step.command.capability === metadata?.capability &&
                step.confirmation.required &&
                Object.hasOwn(
                  step.route.capability.parameters ?? {},
                  nextParameter,
                ),
            )
          )
            throw new Error(
              "A correction question requested an undeclared or fixed field.",
            );
          return completed(
            input.interaction.requestClarification(
              {
                response: { ...interpretation.response, expectsFollowUp: true },
              },
              revise(interpretation.response.text, nextParameter),
            ),
          );
        }
        if (interpretation.kind !== "command" && interpretation.kind !== "plan")
          throw new Error(
            "A confirmation correction may not execute reads or return unrelated output.",
          );
        const commands = applyPlanCorrection(plan, interpretation, reply);
        if (
          commands.every(
            (command, index) => command === plan.steps[index]!.command,
          )
        )
          return { kind: "unchanged" };
        const validation = input.validate(commands, plan.kind);
        if (!validation.ok)
          return completed(
            "error" in validation
              ? outcomeFromError(validation.error)
              : invalidCorrectionOutcome,
          );
        return {
          kind: "completed",
          outcome: requestWorkflowConfirmation(input, validation.plan),
        };
      } catch (error) {
        return completed(unexpectedOutcome(error));
      }
    };
  }
}

const invalidCorrectionOutcome: AssistantOutcome = {
  response: {
    status: "unknown",
    text: "I need the complete change before preparing that action again. Please restate the request.",
  },
};
