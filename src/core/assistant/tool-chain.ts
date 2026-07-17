import type { AssistantOutcome } from "../../ports/assistant.js";
import type { ValidatedAssistantPlanStep } from "../../ports/assistant-plan.js";
import type {
  IntentInterpretation,
  IntentInterpreterSession,
} from "../../ports/intent.js";
import type { AssistantResultReference } from "../../ports/result-reference.js";
import type { CommandExecutionOutcome } from "./plan-execution.js";

type ToolCallInterpretation = Extract<
  IntentInterpretation,
  { kind: "tool_call" }
>;

type ToolChainResolution =
  | {
      interpretation: Exclude<IntentInterpretation, { kind: "tool_call" }>;
      kind: "interpretation";
    }
  | { kind: "outcome"; outcome: AssistantOutcome };

export async function resolveToolCalls(input: {
  executeRead(
    step: ValidatedAssistantPlanStep,
  ): Promise<CommandExecutionOutcome>;
  initial: ToolCallInterpretation;
  publicReferences(): readonly AssistantResultReference[];
  session: IntentInterpreterSession | undefined;
  validateRead(
    interpretation: ToolCallInterpretation,
  ):
    | { ok: true; step: ValidatedAssistantPlanStep }
    | { ok: false; outcome: AssistantOutcome };
}): Promise<ToolChainResolution> {
  if (!input.session) {
    return rejectToolChain(
      input.initial.call.command.capability,
      "The intent provider did not create a resumable session.",
    );
  }

  const callIds = new Set<string>();
  let interpretation: IntentInterpretation = input.initial;

  for (let callNumber = 0; interpretation.kind === "tool_call"; callNumber++) {
    const { call } = interpretation;
    if (callNumber >= 2) {
      return rejectToolChain(
        call.command.capability,
        "A tool chain may contain at most two read calls.",
      );
    }
    if (call.id.trim().length === 0 || callIds.has(call.id)) {
      return rejectToolChain(
        call.command.capability,
        "The intent provider returned an invalid tool call identifier.",
      );
    }
    callIds.add(call.id);

    const validation = input.validateRead(interpretation);
    if (!validation.ok) return { kind: "outcome", outcome: validation.outcome };

    const execution = await input.executeRead(validation.step);
    if (execution.outcome.response.status !== "ok") {
      return { kind: "outcome", outcome: execution.outcome };
    }

    const resultReferences = input.publicReferences();
    interpretation = await input.session.next({
      callId: call.id,
      kind: "tool_result",
      observation: Object.freeze({
        capability: validation.step.command.capability,
        ...(execution.data ? { data: execution.data } : {}),
        ...(resultReferences.length > 0 ? { resultReferences } : {}),
        text: execution.outcome.response.text,
      }),
    });
  }

  return { interpretation, kind: "interpretation" };
}

export function rejectToolChain(
  capability: string,
  message: string,
): Extract<ToolChainResolution, { kind: "outcome" }> {
  return {
    kind: "outcome",
    outcome: {
      diagnostics: [{ capability, category: "unsupported", message }],
      response: {
        status: "unsupported",
        text: "I cannot safely complete that chained request.",
      },
    },
  };
}
