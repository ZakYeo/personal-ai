import type {
  AssistantOutcome,
  AssistantToolChainCallOutcome,
} from "../../ports/assistant.js";
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

interface ToolChainState {
  readonly callIds: Set<string>;
  readonly calls: AssistantToolChainCallOutcome[];
  readCalls: number;
}

export function createToolChainState(): ToolChainState {
  return { callIds: new Set<string>(), calls: [], readCalls: 0 };
}

export async function resolveToolCalls(input: {
  executeRead(
    step: ValidatedAssistantPlanStep,
  ): Promise<CommandExecutionOutcome>;
  initial: ToolCallInterpretation;
  publicReferences(): readonly AssistantResultReference[];
  session: IntentInterpreterSession;
  state: ToolChainState;
  validateRead(
    interpretation: ToolCallInterpretation,
  ):
    | { ok: true; step: ValidatedAssistantPlanStep }
    | { ok: false; outcome: AssistantOutcome };
}): Promise<ToolChainResolution> {
  let interpretation: IntentInterpretation = input.initial;

  while (interpretation.kind === "tool_call") {
    const { call } = interpretation;
    if (input.state.readCalls >= 2) {
      return failToolCall(
        input.state,
        call.command.capability,
        rejectToolChain(
          call.command.capability,
          "A tool chain may contain at most two read calls.",
        ),
      );
    }
    if (call.id.trim().length === 0 || input.state.callIds.has(call.id)) {
      return failToolCall(
        input.state,
        call.command.capability,
        rejectToolChain(
          call.command.capability,
          "The intent provider returned an invalid tool call identifier.",
        ),
      );
    }
    input.state.callIds.add(call.id);

    const validation = input.validateRead(interpretation);
    if (!validation.ok) {
      return failToolCall(input.state, call.command.capability, {
        kind: "outcome",
        outcome: validation.outcome,
      });
    }

    const execution = await input.executeRead(validation.step);
    if (execution.outcome.response.status !== "ok") {
      return failToolCall(input.state, call.command.capability, {
        kind: "outcome",
        outcome: execution.outcome,
      });
    }
    input.state.calls.push({
      capability: validation.step.command.capability,
      ...(execution.data ? { data: execution.data } : {}),
      status: "succeeded",
    });
    input.state.readCalls++;

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

  if (input.state.readCalls > 0 && interpretation.kind === "conversation") {
    return {
      kind: "outcome",
      outcome: withToolChainOutcome(
        rejectToolChain(
          "conversation.general",
          "A workflow that executed reads must end in a command, plan, clarification, or safe rejection.",
        ).outcome,
        input.state,
      ),
    };
  }

  return { interpretation, kind: "interpretation" };
}

export function withToolChainOutcome(
  outcome: AssistantOutcome,
  state: ReturnType<typeof createToolChainState>,
): AssistantOutcome {
  return state.calls.length === 0
    ? outcome
    : { ...outcome, toolChain: { calls: Object.freeze([...state.calls]) } };
}

function failToolCall(
  state: ToolChainState,
  capability: string,
  resolution: Extract<ToolChainResolution, { kind: "outcome" }>,
): Extract<ToolChainResolution, { kind: "outcome" }> {
  state.calls.push({
    capability,
    ...(resolution.outcome.diagnostics
      ? { diagnostics: resolution.outcome.diagnostics }
      : {}),
    status: "failed",
  });
  return {
    kind: "outcome",
    outcome: withToolChainOutcome(resolution.outcome, state),
  };
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
