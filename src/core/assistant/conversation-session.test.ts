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
      compactor: { compact: (state) => Promise.resolve(state) },
      history: { maxTurnsBeforeCompaction: 10 },
      responder: { respond },
    });

    const first = await session.respond("first", context);
    await session.commit("first", first, context);
    const second = await session.respond("second", context);
    await session.commit("second", second, context);
    await session.respond("third", context);

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
});
