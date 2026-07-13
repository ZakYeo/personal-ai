import { createOpenAIUrl, resolveOpenAIApiKey } from "./openai-client.js";

describe("OpenAI client helpers", () => {
  it("resolves configured API keys from the environment", () => {
    expect(
      resolveOpenAIApiKey(
        { apiKeyEnv: "OPENAI_API_KEY" },
        { OPENAI_API_KEY: "test-key" },
      ),
    ).toBe("test-key");
  });

  it("constructs missing-key errors through caller policy", () => {
    const expected = new TypeError("missing provider key");

    expect(() =>
      resolveOpenAIApiKey({ apiKeyEnv: "OPENAI_API_KEY" }, {}, () => expected),
    ).toThrow(expected);
  });

  it("joins provider base URLs with endpoint paths", () => {
    expect(createOpenAIUrl("https://api.openai.test/v1/", "responses")).toBe(
      "https://api.openai.test/v1/responses",
    );
  });
});
