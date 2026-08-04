import {
  createAssistantWithFeatures as createAssistant,
  createAssistantConfig,
  createConversationCompactor,
  createFixedClock,
  createInterpreter,
} from "../../test-support/core-assistant.js";
import type { ConversationState } from "../../ports/conversation.js";

const config = createAssistantConfig({
  test: { enabled: true },
  disabled: { enabled: false },
});
const clock = createFixedClock();

describe("createAssistant", () => {
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

  it("applies the human-facing policy to conversation output", async () => {
    const assistant = createAssistant({
      clock,
      config,
      conversation: {
        compactor: createConversationCompactor(),
        history: { maxTurnsBeforeCompaction: 5 },
        responder: {
          respond: () =>
            Promise.resolve({
              status: "ok",
              text: "Updated at 2026-06-26T09:00:00.000Z. See https://example.test/details.",
            }),
        },
      },
      features: [],
      intentInterpreter: createInterpreter({ kind: "conversation" }),
    });

    await expect(assistant.handleText("what changed?")).resolves.toEqual({
      status: "ok",
      text: "Updated at 10am today. See",
    });
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
        response: {
          status: "error",
          text: "I could not answer that right now.",
        },
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
      response: {
        status: "error",
        text: "I could not answer that right now.",
      },
    });
    expect(respond).toHaveBeenNthCalledWith(
      2,
      "second",
      { recentTurns: [] },
      { clock, config },
    );
  });
});
