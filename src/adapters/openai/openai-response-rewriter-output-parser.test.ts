import { parseOpenAIResponseRewrite } from "./openai-response-rewriter-output-parser.js";

describe("parseOpenAIResponseRewrite", () => {
  it("rejects rewritten text above the application limit", () => {
    expect(() =>
      parseOpenAIResponseRewrite(JSON.stringify({ text: "a".repeat(16_001) })),
    ).toThrow("OpenAI response rewrite text exceeded the application limit.");
  });
});
