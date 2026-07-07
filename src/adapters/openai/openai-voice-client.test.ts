import { createOpenAIUrl, resolveOpenAIApiKey } from "./openai-voice-client.js";

describe("openai voice client helpers", () => {
  it("resolves configured API keys from the environment", () => {
    expect(
      resolveOpenAIApiKey(
        { apiKeyEnv: "OPENAI_API_KEY" },
        { OPENAI_API_KEY: "test-key" },
      ),
    ).toBe("test-key");
  });

  it("rejects missing API keys", () => {
    expect(() =>
      resolveOpenAIApiKey({ apiKeyEnv: "OPENAI_API_KEY" }, {}),
    ).toThrow("OpenAI API key environment variable OPENAI_API_KEY is not set.");
  });

  it("joins provider base URLs with endpoint paths", () => {
    expect(createOpenAIUrl("https://api.openai.test/v1", "audio/speech")).toBe(
      "https://api.openai.test/v1/audio/speech",
    );
  });
});
