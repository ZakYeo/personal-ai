import type { ValidatedAssistantPlanStep } from "../../ports/assistant-plan.js";
import type {
  IntentInterpretation,
  IntentInterpreterSession,
} from "../../ports/intent.js";
import { createRawFeature } from "../../test-support/core-assistant.js";
import { createToolChainState, resolveToolCalls } from "./tool-chain.js";
import type { CommandExecutionOutcome } from "./plan-execution.js";

describe("resolveToolCalls", () => {
  it("rejects conversation after a read has executed", async () => {
    const result = await runToolChain([
      toolCall("read-1"),
      { kind: "conversation" },
    ]);

    expect(result).toMatchObject({
      kind: "outcome",
      outcome: {
        response: {
          status: "unsupported",
          text: "I cannot safely complete that chained request.",
        },
      },
    });
  });

  it.each(["", "   "])(
    "rejects invalid call id %j before execution",
    async (id) => {
      const executeRead = vi.fn(() => successfulRead);
      const result = await runToolChain([toolCall(id)], { executeRead });

      expect(result).toMatchObject({ kind: "outcome" });
      expect(executeRead).not.toHaveBeenCalled();
    },
  );

  it("rejects a duplicate call id after exactly one execution", async () => {
    const executeRead = vi.fn(() => successfulRead);
    const result = await runToolChain(
      [toolCall("same-call"), toolCall("same-call")],
      { executeRead },
    );

    expect(result).toMatchObject({ kind: "outcome" });
    expect(executeRead).toHaveBeenCalledTimes(1);
  });

  it("stops without provider continuation when read validation fails", async () => {
    const sessionNext = vi.fn();
    const executeRead = vi.fn(() => successfulRead);
    const result = await runToolChain([toolCall("read-1")], {
      executeRead,
      sessionNext,
      validateRead: () => ({
        ok: false,
        outcome: failureOutcome("invalid arguments"),
      }),
    });

    expect(result).toMatchObject({ kind: "outcome" });
    expect(executeRead).not.toHaveBeenCalled();
    expect(sessionNext).not.toHaveBeenCalled();
  });

  it("stops without provider retry when read execution fails", async () => {
    const sessionNext = vi.fn();
    const executeRead = vi.fn(() =>
      Promise.resolve({
        outcome: failureOutcome("calendar unavailable"),
      }),
    );
    const result = await runToolChain([toolCall("read-1")], {
      executeRead,
      sessionNext,
    });

    expect(result).toMatchObject({
      kind: "outcome",
      outcome: {
        toolChain: {
          calls: [{ capability: "calendar.search_events", status: "failed" }],
        },
      },
    });
    expect(executeRead).toHaveBeenCalledTimes(1);
    expect(sessionNext).not.toHaveBeenCalled();
  });
});

function runToolChain(
  interpretations: IntentInterpretation[],
  overrides: Partial<{
    executeRead: () => Promise<CommandExecutionOutcome>;
    sessionNext: IntentInterpreterSession["next"];
    validateRead: () =>
      | { ok: true; step: ValidatedAssistantPlanStep }
      | { ok: false; outcome: ReturnType<typeof failureOutcome> };
  }> = {},
) {
  const initial = interpretations.shift();
  if (initial?.kind !== "tool_call")
    throw new Error("Expected initial tool call.");
  const sessionNext =
    overrides.sessionNext ??
    vi.fn(() => Promise.resolve(interpretations.shift()!));
  return resolveToolCalls({
    executeRead: overrides.executeRead ?? (() => successfulRead),
    initial,
    publicReferences: () => [],
    session: { next: sessionNext },
    state: createToolChainState(),
    validateRead: overrides.validateRead ?? (() => ({ ok: true, step })),
  });
}

function toolCall(id: string): IntentInterpretation {
  return {
    call: {
      command: {
        capability: "calendar.search_events",
        parameters: {},
        rawText: "search",
      },
      id,
    },
    kind: "tool_call",
  };
}

function failureOutcome(message: string) {
  return {
    diagnostics: [{ category: "validation" as const, message }],
    response: { status: "invalid" as const, text: "Invalid." },
  };
}

const feature = createRawFeature({
  id: "calendar",
  capabilities: [
    { name: "calendar.search_events", risk: "low", toolChain: "read" },
  ],
});
const step: ValidatedAssistantPlanStep = {
  command: {
    capability: "calendar.search_events",
    parameters: {},
    rawText: "search",
  },
  confirmation: { required: false },
  decodedArgs: {},
  route: { capability: feature.capabilities[0]!, feature },
};
const successfulRead = Promise.resolve({
  data: { count: 1 },
  outcome: { response: { status: "ok" as const, text: "Read." } },
});
