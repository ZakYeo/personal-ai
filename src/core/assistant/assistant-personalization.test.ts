import type { AssistantContext } from "../../ports/assistant.js";
import {
  createAssistantConfig,
  createAssistantWithFeatures as createAssistant,
  createFeature,
  createFixedClock,
} from "../../test-support/core-assistant.js";

describe("assistant personalization", () => {
  it("reads one frozen personalization snapshot per serialized turn", async () => {
    const observed: AssistantContext[] = [];
    const snapshots = [
      { preferredName: "Zak", responseStyle: "concise" as const },
      { preferredName: "Zachary", responseStyle: "detailed" as const },
    ];
    const assistant = createAssistant({
      clock: createFixedClock(),
      config: createAssistantConfig(),
      features: [createFeature()],
      intentInterpreter: {
        start: (_text, context) => {
          observed.push(context);
          return {
            next: () => Promise.resolve({ kind: "conversation" as const }),
          };
        },
      },
      conversation: {
        compactor: { compact: () => Promise.resolve("summary") },
        history: { maxTurnsBeforeCompaction: 5 },
        responder: {
          respond: (_input, _state, context) => {
            observed.push(context);
            return Promise.resolve({ status: "ok", text: "Hello." });
          },
        },
      },
      personalizationReader: {
        readAssistantPersonalization: vi
          .fn()
          .mockResolvedValueOnce(snapshots[0])
          .mockResolvedValueOnce(snapshots[1]),
      },
    });

    await assistant.handleText("first");
    await assistant.handleText("second");

    expect(observed.map((context) => context.personalization)).toEqual([
      snapshots[0],
      snapshots[0],
      snapshots[1],
      snapshots[1],
    ]);
    expect(Object.isFrozen(observed[0]?.personalization)).toBe(true);
  });

  it("continues safely without personalization and retains diagnostics when reading fails", async () => {
    const failure = new Error("profile disk failed");
    const assistant = createAssistant({
      clock: createFixedClock(),
      config: createAssistantConfig(),
      features: [],
      intentInterpreter: {
        start: () => ({
          next: () => Promise.resolve({ kind: "conversation" as const }),
        }),
      },
      conversation: {
        compactor: { compact: () => Promise.resolve("summary") },
        history: { maxTurnsBeforeCompaction: 5 },
        responder: {
          respond: (_input, _state, context) => {
            expect(context.personalization).toBeUndefined();
            return Promise.resolve({ status: "ok", text: "Hello." });
          },
        },
      },
      personalizationReader: {
        readAssistantPersonalization: () => Promise.reject(failure),
      },
    });

    await expect(assistant.handleTextWithDiagnostics("hello")).resolves.toEqual(
      {
        diagnostics: [
          {
            category: "personalization_failure",
            cause: failure,
            message: "profile disk failed",
          },
        ],
        response: { status: "ok", text: "Hello." },
      },
    );
  });
});
