import { createCapabilityRoutingIndex } from "../../application/capability-catalog.js";
import {
  createAssistantConfig,
  createFeature,
  createFixedClock,
} from "../../test-support/core-assistant.js";
import type {
  IntentInterpreterPort,
  IntentInterpreterSession,
} from "../../ports/intent.js";
import { createAssistant } from "./assistant.js";

describe("assistant cancellation ownership", () => {
  it("resumes a clarification in the same provider session with a fresh signal", async () => {
    const original = new AbortController();
    const resumed = new AbortController();
    const next = vi
      .fn<IntentInterpreterSession["next"]>()
      .mockResolvedValueOnce({
        kind: "clarification",
        clarification: {
          capability: "test.echo",
          origin: "semantic_validation",
          session: "resume",
        },
        response: { status: "ok", text: "What details should I use?" },
      })
      .mockResolvedValueOnce(command);
    const start = vi.fn(() => ({ next }));
    const feature = createFeature();
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([feature]),
      clock: createFixedClock(),
      config: createAssistantConfig(),
      intentInterpreter: { start },
    });
    await expect(
      assistant.handleText("perform the action", { signal: original.signal }),
    ).resolves.toMatchObject({ expectsFollowUp: true });
    original.abort(new Error("old speech stopped"));
    await expect(
      assistant.handleText("use these details", { signal: resumed.signal }),
    ).resolves.toMatchObject({ status: "ok" });
    expect(start).toHaveBeenCalledOnce();
    expect(next.mock.calls.map((call) => call[1]?.signal)).toEqual([
      original.signal,
      resumed.signal,
    ]);
  });

  it("preserves completed plan steps and prevents later steps after cancellation", async () => {
    const turn = new AbortController();
    const execute = vi.fn(() => {
      turn.abort(new Error("stop after completion"));
      return Promise.resolve({ text: "Completed the first action." });
    });
    const feature = createFeature({ execute });
    const interpreter: IntentInterpreterPort = {
      start: () => ({
        next: () =>
          Promise.resolve({
            kind: "plan",
            plan: {
              commands: [command.command, command.command, command.command],
            },
          }),
      }),
    };
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([feature]),
      clock: createFixedClock(),
      config: createAssistantConfig(),
      intentInterpreter: interpreter,
    });
    const outcome = await assistant.handleTextWithDiagnostics(
      "perform three actions",
      { signal: turn.signal },
    );
    expect(outcome.plan?.steps.map((step) => step.status)).toEqual([
      "succeeded",
      "failed",
      "skipped",
    ]);
    expect(execute).toHaveBeenCalledOnce();
    expect(outcome.response.text).toContain("Completed the first action.");
  });

  it.each([true, false])(
    "resumes the validated confirmation with the current request signal: %s",
    async (withSignal) => {
      const original = new AbortController();
      const resumed = new AbortController();
      const signals: Array<AbortSignal | undefined> = [];
      const feature = createFeature({
        capability: { name: "test.echo", risk: "high", parameters: {} },
        confirmation: () => ({ text: "perform the exact action", facts: {} }),
        execute: (_request, context) => {
          signals.push(context.signal);
          return Promise.resolve({ text: "Completed." });
        },
      });
      const start = vi.fn(() => ({ next: () => Promise.resolve(command) }));
      const assistant = createAssistant({
        capabilityRouting: createCapabilityRoutingIndex([feature]),
        clock: createFixedClock(),
        config: createAssistantConfig(),
        intentInterpreter: { start },
      });
      await expect(
        assistant.handleText("perform the action", { signal: original.signal }),
      ).resolves.toMatchObject({ status: "needs_confirmation" });
      original.abort(new Error("previous speech stopped"));
      await expect(
        assistant.handleText("yes", {
          signal: AbortSignal.abort(new Error("cancelled approval")),
        }),
      ).resolves.toMatchObject({ status: "error" });
      await expect(
        assistant.handleText(
          "yes",
          withSignal ? { signal: resumed.signal } : {},
        ),
      ).resolves.toMatchObject({ status: "ok" });
      expect(signals).toEqual([withSignal ? resumed.signal : undefined]);
      expect(start).toHaveBeenCalledOnce();
    },
  );

  it("does not execute a late interpretation after cancellation", async () => {
    const turn = new AbortController();
    let finish: ((value: typeof command) => void) | undefined;
    const interpretation = new Promise<typeof command>((resolve) => {
      finish = resolve;
    });
    const execute = vi.fn(() => Promise.resolve({ text: "Completed." }));
    const feature = createFeature({ execute });
    const next = vi.fn(() => interpretation);
    const interpreter: IntentInterpreterPort = {
      start: () => ({ next }),
    };
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([feature]),
      clock: createFixedClock(),
      config: createAssistantConfig(),
      intentInterpreter: interpreter,
    });
    const result = assistant.handleTextWithDiagnostics("perform the action", {
      signal: turn.signal,
    });
    await vi.waitUntil(() => next.mock.calls.length === 1);
    turn.abort(new Error("turn cancelled"));
    finish?.(command);
    await expect(result).resolves.toMatchObject({
      response: { status: "error" },
    });
    expect(execute).not.toHaveBeenCalled();
  });
});

const command = {
  kind: "command" as const,
  command: {
    capability: "test.echo",
    parameters: {},
    rawText: "perform the action",
  },
};
