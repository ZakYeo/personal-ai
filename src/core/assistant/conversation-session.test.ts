import {
  createAssistantConfig,
  createFixedClock,
} from "../../test-support/core-assistant.js";
import type { AssistantResponse } from "../../ports/assistant.js";
import type { ConversationState } from "../../ports/conversation.js";
import { createConversationSession } from "./conversation-session.js";

const context = {
  clock: createFixedClock(),
  config: createAssistantConfig({}),
};

describe("createConversationSession", () => {
  it("serializes concurrent turns so history follows invocation order", async () => {
    let resolveFirst: ((response: AssistantResponse) => void) | undefined;
    const states: ConversationState[] = [];
    const respond = vi.fn((input: string, state: ConversationState) => {
      states.push(state);

      if (input === "first") {
        return new Promise<AssistantResponse>((resolve) => {
          resolveFirst = resolve;
        });
      }

      return Promise.resolve({ status: "ok" as const, text: `${input} reply` });
    });
    const session = createConversationSession({
      compactor: { compact: (state) => Promise.resolve(state) },
      history: { maxTurnsBeforeCompaction: 10 },
      responder: { respond },
    });

    const first = session.respond("first", context);
    const second = session.respond("second", context);

    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(1));
    resolveFirst?.({ status: "ok", text: "first reply" });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "ok", text: "first reply" },
      { status: "ok", text: "second reply" },
    ]);
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
