import {
  createAssistantConfig,
  createFixedClock,
} from "../../test-support/core-assistant.js";
import type { ConversationState } from "../../ports/conversation.js";
import { createConversationSession } from "./conversation-session.js";

const context = {
  clock: createFixedClock(),
  config: createAssistantConfig({}),
};

describe("createConversationSession", () => {
  it("shares committed turns with subsequent responders", async () => {
    const states: ConversationState[] = [];
    const respond = vi.fn((input: string, state: ConversationState) => {
      states.push(state);
      return Promise.resolve({ status: "ok" as const, text: `${input} reply` });
    });
    const session = createConversationSession({
      compactor: { compact: () => Promise.resolve("unused summary") },
      history: { maxTurnsBeforeCompaction: 10 },
      responder: { respond },
    });

    const first = await session.respond("first", session.snapshot(), context);
    await session.commit("first", first, context);
    const second = await session.respond("second", session.snapshot(), context);
    await session.commit("second", second, context);
    await session.respond("third", session.snapshot(), context);

    expect(states).toEqual([
      { recentTurns: [] },
      {
        recentTurns: [
          { content: "first", role: "user" },
          { content: "first reply", role: "assistant" },
        ],
      },
      {
        recentTurns: [
          { content: "first", role: "user" },
          { content: "first reply", role: "assistant" },
          { content: "second", role: "user" },
          { content: "second reply", role: "assistant" },
        ],
      },
    ]);
  });

  it("does not commit an oversized compaction summary", async () => {
    const session = createConversationSession({
      compactor: {
        compact: () => Promise.resolve("a".repeat(2_001)),
      },
      history: { maxTurnsBeforeCompaction: 1 },
      responder: {
        respond: () => Promise.resolve({ status: "ok", text: "reply" }),
      },
    });

    await expect(
      session.commit("first", { status: "ok", text: "reply" }, context),
    ).rejects.toThrow("Conversation summary exceeded the application limit.");
    expect(session.snapshot()).toEqual({ recentTurns: [] });
  });

  it("keeps ownership of recent turns when installing a compacted summary", async () => {
    const session = createConversationSession({
      compactor: {
        compact: () => Promise.resolve("provider summary"),
      },
      history: { maxTurnsBeforeCompaction: 1 },
      responder: {
        respond: () => Promise.resolve({ status: "ok", text: "reply" }),
      },
    });

    await session.commit("first", { status: "ok", text: "reply" }, context);

    expect(session.snapshot()).toEqual({
      recentTurns: [],
      summary: "provider summary",
    });
  });

  it("rejects a compactor result that violates the summary-only contract", async () => {
    const session = createConversationSession({
      compactor: {
        compact: () =>
          Promise.resolve({
            recentTurns: [{ content: "injected", role: "user" }],
            summary: "provider summary",
          } as unknown as string),
      },
      history: { maxTurnsBeforeCompaction: 1 },
      responder: {
        respond: () => Promise.resolve({ status: "ok", text: "reply" }),
      },
    });

    await expect(
      session.commit("first", { status: "ok", text: "reply" }, context),
    ).rejects.toThrow("Conversation summary must be a non-empty string.");
    expect(session.snapshot()).toEqual({ recentTurns: [] });
  });
});
