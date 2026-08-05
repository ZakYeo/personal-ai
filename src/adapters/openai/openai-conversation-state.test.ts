import type { ConversationState } from "../../ports/conversation.js";
import { formatOpenAIConversationStateMessages } from "./openai-conversation-state.js";

describe("OpenAI conversation state", () => {
  it("serializes prior user and assistant turns as Responses API messages", () => {
    const state: ConversationState = {
      recentTurns: [
        { content: "How are you?", role: "user" },
        { content: "I am doing well.", role: "assistant" },
      ],
      summary: "The user is checking in casually.",
    };

    expect(formatOpenAIConversationStateMessages(state)).toEqual([
      {
        content:
          "Earlier conversation summary: The user is checking in casually.",
        role: "assistant",
      },
      { content: "How are you?", role: "user" },
      { content: "I am doing well.", role: "assistant" },
    ]);
  });
});
