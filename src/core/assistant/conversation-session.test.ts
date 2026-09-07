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
  it("bounds repeated failures and retries compaction after history was pruned", async () => {
    const compact = vi
      .fn()
      .mockRejectedValue(new Error("provider unavailable"));
    const session = createConversationSession({
      compactor: { compact },
      history: { maxTurnsBeforeCompaction: 11 },
      responder: { respond: vi.fn() },
    });
    for (let index = 0; index < 14; index += 1) {
      await session
        .commit(`turn ${index}`, { status: "ok", text: "reply" }, context)
        .catch(() => {});
    }
    expect(compact).toHaveBeenCalledTimes(4);
    expect(session.snapshot().recentTurns).toHaveLength(20);
    expect(session.snapshot().recentTurns[0]?.content).toBe("turn 4");
    compact.mockResolvedValue("recovered summary");
    await session.commit("recovery", { status: "ok", text: "reply" }, context);
    expect(session.snapshot()).toEqual({
      summary: "recovered summary",
      recentTurns: [],
    });
  });

  it("preserves the previous summary and newest pair within a fixed character bound", async () => {
    const compact = vi
      .fn()
      .mockResolvedValueOnce("previous summary")
      .mockRejectedValue(new Error("failed"));
    const onCompacted = vi.fn();
    const session = createConversationSession({
      compactor: { compact },
      history: { maxTurnsBeforeCompaction: 1 },
      onCompacted,
      responder: { respond: vi.fn() },
    });
    await session.commit("initial", { status: "ok", text: "reply" }, context);
    for (let index = 0; index < 3; index += 1) {
      await expect(
        session.commit(
          "u".repeat(20_000),
          { status: "ok", text: "a".repeat(20_000) },
          context,
        ),
      ).rejects.toThrow();
    }
    const snapshot = session.snapshot();
    expect(snapshot.summary).toBe("previous summary");
    expect(snapshot.recentTurns).toHaveLength(2);
    expect(
      snapshot.recentTurns.reduce((sum, turn) => sum + turn.content.length, 0),
    ).toBe(32_000);
    expect(snapshot.recentTurns.map((turn) => turn.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(onCompacted).toHaveBeenCalledOnce();
    expect(Object.isFrozen(snapshot.recentTurns[0])).toBe(true);
  });
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
    expect(session.snapshot()).toEqual({
      recentTurns: [
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
      ],
    });
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
    expect(session.snapshot()).toEqual({
      recentTurns: [
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
      ],
    });
  });
});
