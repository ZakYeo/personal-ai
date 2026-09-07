import type {
  IntentInterpretation,
  IntentSessionContinuation,
} from "../../ports/intent.js";
import {
  createAssistantHarness,
  createFeature,
} from "../../test-support/core-assistant.js";

const initialTime = Date.parse("2026-09-07T10:00:00Z");

describe("bounded clarification drafts", () => {
  it("keeps the original deadline across successive questions", async () => {
    const harness = createHarness([
      clarification("label", {}),
      clarification("time", { label: "Tea" }),
    ]);
    await harness.assistant.handleText("prepare an action");
    harness.setElapsed(299_000);
    await harness.assistant.handleText("Tea");
    harness.setElapsed(300_000);
    await expect(harness.assistant.handleText("10am")).resolves.toMatchObject({
      text: "That draft expired. Please start the request again.",
    });
    expect(harness.continuations).toHaveLength(1);
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("rejects a provider command that arrives after draft expiry", async () => {
    let resolveReply: (value: IntentInterpretation) => void = () => {};
    let replyStarted = false;
    const harness = createHarness([
      clarification("label", {}),
      () => {
        replyStarted = true;
        return new Promise<IntentInterpretation>((resolve) => {
          resolveReply = resolve;
        });
      },
    ]);
    await harness.assistant.handleText("prepare an action");
    const reply = harness.assistant.handleText("Tea at 10am");
    await vi.waitUntil(() => replyStarted);
    harness.setElapsed(300_000);
    resolveReply({
      kind: "command",
      command: {
        capability: "test.draft",
        parameters: { label: "Tea", time: "10am" },
        rawText: "Tea at 10am",
      },
    });
    await expect(reply).resolves.toMatchObject({
      text: "That draft expired. Please start the request again.",
    });
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("retains validated fields through successive questions in the same provider session", async () => {
    const harness = createHarness([
      clarification("label", {}),
      clarification("time", { label: "Tea" }),
      {
        kind: "command",
        command: {
          capability: "test.draft",
          rawText: "Tea at ten",
          parameters: { label: "Tea", time: "10am" },
        },
      },
    ]);
    await harness.assistant.handleText("prepare an action");
    await expect(harness.assistant.handleText("Tea")).resolves.toMatchObject({
      expectsFollowUp: true,
      text: "What time?",
    });
    await expect(harness.assistant.handleText("10am")).resolves.toMatchObject({
      text: "Completed.",
    });
    expect(harness.starts).toHaveBeenCalledOnce();
    expect(harness.execute).toHaveBeenCalledOnce();
    expect(harness.continuations[1]).toMatchObject({
      clarification: {
        draft: {
          capability: "test.draft",
          parameters: { label: "Tea" },
          missingParameters: ["time"],
          remainingReplies: 1,
        },
      },
    });
  });

  it("discards a draft at five minutes before asking the provider to resume", async () => {
    const harness = createHarness([clarification("label", {})]);
    await harness.assistant.handleText("prepare an action");
    harness.setElapsed(300_000);
    await expect(harness.assistant.handleText("Tea")).resolves.toMatchObject({
      text: "That draft expired. Please start the request again.",
    });
    expect(harness.continuations).toEqual([]);
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("ends after three clarification replies without asking for another voice turn", async () => {
    const harness = createHarness(
      Array.from({ length: 4 }, () => clarification("label", {})),
    );
    await harness.assistant.handleText("prepare an action");
    await harness.assistant.handleText("first reply");
    await harness.assistant.handleText("second reply");
    const response = await harness.assistant.handleText("third reply");
    expect(response).toEqual({
      status: "unknown",
      text: "I still need more information. Please restate the request with the missing details.",
    });
    expect(harness.continuations).toHaveLength(3);
    expect(harness.execute).not.toHaveBeenCalled();
  });
});

function clarification(
  parameter: string,
  parameters: Record<string, string>,
): IntentInterpretation {
  return {
    kind: "clarification",
    response: { status: "ok", text: `What ${parameter}?` },
    clarification: {
      capability: "test.draft",
      origin: "intent_interpreter",
      parameter,
      partialCommand: {
        capability: "test.draft",
        parameters,
        rawText: "prepare an action",
      },
      session: "resume",
    },
  };
}

function createHarness(
  steps: Array<IntentInterpretation | (() => Promise<IntentInterpretation>)>,
) {
  let elapsed = 0;
  const continuations: IntentSessionContinuation[] = [];
  const execute = vi.fn(() => Promise.resolve({ text: "Completed." }));
  const starts = vi.fn(() => ({
    next: (continuation?: IntentSessionContinuation) => {
      if (continuation) continuations.push(continuation);
      const next = steps.shift();
      if (!next) throw new Error("Unexpected continuation.");
      return typeof next === "function" ? next() : Promise.resolve(next);
    },
  }));
  const assistant = createAssistantHarness({
    clock: { now: () => new Date(initialTime + elapsed) },
    features: [
      createFeature({
        capability: {
          name: "test.draft",
          risk: "low",
          parameters: {
            label: { type: "string", required: true },
            time: { type: "string", required: true },
          },
        },
        execute,
      }),
    ],
    intentInterpreter: { start: starts },
  });
  return {
    assistant,
    continuations,
    execute,
    starts,
    setElapsed: (value: number) => {
      elapsed = value;
    },
  };
}
