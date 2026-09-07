import type { AssistantCommand } from "../../ports/assistant.js";
import type { ValidatedAssistantPlan } from "../../ports/assistant-plan.js";
import type { IntentInterpretation } from "../../ports/intent.js";
import { decodeCommandForCapability } from "./command-validation.js";

export function applyPlanCorrection(
  plan: ValidatedAssistantPlan,
  interpretation: Extract<IntentInterpretation, { kind: "command" | "plan" }>,
  trustedReply: string,
): readonly AssistantCommand[] {
  const patches =
    interpretation.kind === "command"
      ? [interpretation.command]
      : interpretation.plan.commands;
  if (patches.length !== plan.steps.length)
    throw new Error("A correction must preserve every prepared plan step.");
  return Object.freeze(
    plan.steps.map((step, index) => {
      const patch = patches[index]!;
      const partial = decodeCommandForCapability(patch, step.route.capability, {
        allowMissingRequired: true,
      });
      if (!partial.ok) throw new Error(partial.error.message);
      const parameters = { ...step.decodedArgs };
      for (const [name, value] of Object.entries(patch.parameters)) {
        if (value === null || value === undefined) delete parameters[name];
        else parameters[name] = value;
      }
      const command = {
        capability: step.command.capability,
        parameters,
        rawText: trustedReply,
      };
      const bounded = decodeCommandForCapability(
        command,
        step.route.capability,
        { allowMissingRequired: true },
      );
      if (!bounded.ok) throw new Error(bounded.error.message);
      const decoded = decodeCommandForCapability(
        command,
        step.route.capability,
      );
      if (!decoded.ok) throw new Error(decoded.error.message);
      return Object.freeze({
        ...command,
        parameters: Object.freeze(decoded.args),
      });
    }),
  );
}
