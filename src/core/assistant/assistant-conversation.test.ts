import {
  createAssistantWithFeatures as createAssistant,
  createAssistantConfig,
  createConversationCompactor,
  createFeature,
  createFixedClock,
  createInterpreter,
} from "../../test-support/core-assistant.js";
import type { ConversationState } from "../../ports/conversation.js";
import type { AssistantContext } from "../../ports/assistant.js";

const config = createAssistantConfig({
  test: { enabled: true },
  disabled: { enabled: false },
});
const clock = createFixedClock();

describe("createAssistant", () => {
  it("shares completed command turns with intent and conversation providers", async () => {
    const histories: Array<ConversationState | undefined> = [];
    const start = vi.fn(
      (
        text: string,
        _context: AssistantContext,
        history: ConversationState,
      ) => {
        histories.push(history);
        return {
          next: () =>
            Promise.resolve(
              text === "run command"
                ? {
                    command: {
                      capability: "test.echo",
                      parameters: {},
                      rawText: text,
                    },
                    kind: "command" as const,
                  }
                : { kind: "conversation" as const },
            ),
        };
      },
    );
    const respond = vi.fn(() =>
      Promise.resolve({ status: "ok" as const, text: "Context retained." }),
    );
    const assistant = createAssistant({
      clock,
      config,
      conversation: {
        compactor: createConversationCompactor(),
        history: { maxTurnsBeforeCompaction: 5 },
        responder: { respond },
      },
      features: [createFeature()],
      intentInterpreter: { start },
    });

    await expect(assistant.handleText("run command")).resolves.toMatchObject({
      text: "Handled.",
    });
    await expect(assistant.handleText("what happened?")).resolves.toMatchObject(
      { text: "Context retained." },
    );

    const expectedHistory = {
      recentTurns: [
        { content: "run command", role: "user" },
        { content: "Handled.", role: "assistant" },
      ],
    };
    expect(histories[1]).toEqual(expectedHistory);
    expect(respond).toHaveBeenCalledWith("what happened?", expectedHistory, {
      clock,
      config,
    });
  });

  it("answers conversation turns with chat history", async () => {
    const respond = vi
      .fn()
      .mockResolvedValueOnce({ status: "ok", text: "I am good." })
      .mockResolvedValueOnce({
        status: "ok",
        text: "I am still good because you asked earlier.",
      });
    const assistant = createAssistant({
      clock,
      config,
      conversation: {
        compactor: createConversationCompactor(),
        history: { maxTurnsBeforeCompaction: 5 },
        responder: { respond },
      },
      features: [],
      intentInterpreter: createInterpreter({ kind: "conversation" }),
    });

    await expect(
      assistant.handleText("Hey Jarvis, how are you today?"),
    ).resolves.toEqual({
      status: "ok",
      text: "I am good.",
    });
    await expect(assistant.handleText("what did I ask?")).resolves.toEqual({
      status: "ok",
      text: "I am still good because you asked earlier.",
    });

    expect(respond).toHaveBeenNthCalledWith(
      1,
      "Hey Jarvis, how are you today?",
      { recentTurns: [] },
      { clock, config },
    );
    expect(respond).toHaveBeenNthCalledWith(
      2,
      "what did I ask?",
      {
        recentTurns: [
          { content: "Hey Jarvis, how are you today?", role: "user" },
          { content: "I am good.", role: "assistant" },
        ],
      },
      { clock, config },
    );
  });

  it("commits the exact humanized response shared with providers", async () => {
    const histories: ConversationState[] = [];
    const responderStates: ConversationState[] = [];
    const start = vi.fn(
      (
        _text: string,
        _context: AssistantContext,
        history: ConversationState,
      ) => {
        histories.push(history);
        return {
          next: () => Promise.resolve({ kind: "conversation" as const }),
        };
      },
    );
    const assistant = createAssistant({
      clock,
      config,
      conversation: {
        compactor: createConversationCompactor(),
        history: { maxTurnsBeforeCompaction: 5 },
        responder: {
          respond: (_input, state) => {
            responderStates.push(state);
            return state.recentTurns.length === 0
              ? Promise.resolve({
                  status: "ok",
                  text: "Updated at 2026-06-26T09:00:00.000Z. See https://example.test/details.",
                })
              : Promise.resolve({ status: "ok", text: "Still updated." });
          },
        },
      },
      features: [],
      intentInterpreter: { start },
    });

    await expect(assistant.handleText("what changed?")).resolves.toEqual({
      status: "ok",
      text: "Updated at 10am today. See the linked source.",
    });
    await assistant.handleText("is that still current?");

    const expectedHistory = {
      recentTurns: [
        { content: "what changed?", role: "user" },
        {
          content: "Updated at 10am today. See the linked source.",
          role: "assistant",
        },
      ],
    };
    expect(histories[1]).toEqual(expectedHistory);
    expect(responderStates[1]).toEqual(expectedHistory);
    expect(responderStates[1]).toBe(histories[1]);
    expect(Object.isFrozen(histories[1])).toBe(true);
    expect(Object.isFrozen(histories[1]?.recentTurns)).toBe(true);
    expect(Object.isFrozen(histories[1]?.recentTurns[0])).toBe(true);
  });

  it("compacts conversation history after the configured number of chats", async () => {
    const compact = vi.fn((state: ConversationState) =>
      Promise.resolve({
        recentTurns: [],
        summary: `summary for ${state.recentTurns.length} turns`,
      }),
    );
    const respond = vi.fn((input: string, state: ConversationState) =>
      Promise.resolve({
        status: "ok" as const,
        text: state.summary
          ? `answered ${input} with ${state.summary}`
          : `answered ${input}`,
      }),
    );
    const assistant = createAssistant({
      clock,
      config,
      conversation: {
        compactor: { compact },
        history: { maxTurnsBeforeCompaction: 2 },
        responder: { respond },
      },
      features: [],
      intentInterpreter: createInterpreter({ kind: "conversation" }),
    });

    await assistant.handleText("first");
    await assistant.handleText("second");
    await expect(assistant.handleText("third")).resolves.toEqual({
      status: "ok",
      text: "answered third with summary for 4 turns",
    });

    expect(compact).toHaveBeenCalledTimes(1);
    expect(compact).toHaveBeenCalledWith(
      {
        recentTurns: [
          { content: "first", role: "user" },
          { content: "answered first", role: "assistant" },
          { content: "second", role: "user" },
          { content: "answered second", role: "assistant" },
        ],
      },
      { clock, config },
    );
  });

  it("does not answer conversation turns when conversation is not configured", async () => {
    const assistant = createAssistant({
      clock,
      config,
      features: [],
      intentInterpreter: createInterpreter({ kind: "conversation" }),
    });

    await expect(assistant.handleText("how are you?")).resolves.toEqual({
      status: "unknown",
      text: "I could not understand that command.",
    });
  });

  it("returns safe diagnostics when conversation response fails", async () => {
    const cause = new Error("provider secret failure");
    const assistant = createAssistant({
      clock,
      config,
      conversation: {
        compactor: createConversationCompactor(),
        history: { maxTurnsBeforeCompaction: 5 },
        responder: {
          respond: () => Promise.reject(cause),
        },
      },
      features: [],
      intentInterpreter: createInterpreter({ kind: "conversation" }),
    });

    await expect(
      assistant.handleTextWithDiagnostics("how are you?"),
    ).resolves.toEqual({
      diagnostics: [
        {
          category: "conversation_failure",
          cause,
          message: "provider secret failure",
        },
      ],
      response: {
        status: "error",
        text: "I could not answer that right now.",
      },
    });
  });

  it("does not commit conversation history when compaction fails", async () => {
    const cause = new Error("compaction failed");
    const respond = vi.fn((input: string, state: ConversationState) =>
      Promise.resolve({
        status: "ok" as const,
        text: `answered ${input} after ${state.recentTurns.length} turns`,
      }),
    );
    const assistant = createAssistant({
      clock,
      config,
      conversation: {
        compactor: {
          compact: () => Promise.reject(cause),
        },
        history: { maxTurnsBeforeCompaction: 1 },
        responder: { respond },
      },
      features: [],
      intentInterpreter: createInterpreter({ kind: "conversation" }),
    });

    await expect(assistant.handleTextWithDiagnostics("first")).resolves.toEqual(
      {
        diagnostics: [
          {
            category: "conversation_failure",
            cause,
            message: "compaction failed",
          },
        ],
        response: { status: "ok", text: "answered first after 0 turns" },
      },
    );
    await expect(
      assistant.handleTextWithDiagnostics("second"),
    ).resolves.toEqual({
      diagnostics: [
        {
          category: "conversation_failure",
          cause,
          message: "compaction failed",
        },
      ],
      response: { status: "ok", text: "answered second after 0 turns" },
    });
    expect(respond).toHaveBeenNthCalledWith(
      2,
      "second",
      { recentTurns: [] },
      { clock, config },
    );
  });
});
