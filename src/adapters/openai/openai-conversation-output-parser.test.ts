import {
  parseOpenAIConversationResponse,
  parseOpenAIConversationSummary,
} from "./openai-conversation-output-parser.js";

describe("OpenAI conversation output limits", () => {
  it("accepts a conversation summary at the stored summary limit", () => {
    const summary = "a".repeat(2_000);

    expect(parseOpenAIConversationSummary(JSON.stringify({ summary }))).toBe(
      summary,
    );
  });

  it("rejects conversation response text above the application limit", () => {
    expect(() =>
      parseOpenAIConversationResponse(
        JSON.stringify({
          expectsFollowUp: false,
          text: "a".repeat(16_001),
        }),
      ),
    ).toThrow(
      "OpenAI conversation response text exceeded the application limit.",
    );
  });

  it("rejects conversation summaries above the stored summary limit", () => {
    expect(() =>
      parseOpenAIConversationSummary(
        JSON.stringify({ summary: "a".repeat(2_001) }),
      ),
    ).toThrow("OpenAI conversation summary exceeded the application limit.");
  });
});
