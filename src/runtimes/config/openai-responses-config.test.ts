import { parseOptionalOpenAIResponsesConfig } from "./openai-responses-config.js";

describe("OpenAI Responses config parsing", () => {
  it("parses shared defaults with a caller-owned config path", () => {
    expect(
      parseOptionalOpenAIResponsesConfig(
        { model: "gpt-test" },
        "Config conversation.openai",
      ),
    ).toEqual({
      apiKeyEnv: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-test",
      timeoutMs: 30_000,
    });
  });

  it("returns undefined when the optional provider section is absent", () => {
    expect(
      parseOptionalOpenAIResponsesConfig(
        undefined,
        "Config responseRewriter.openai",
      ),
    ).toBeUndefined();
  });

  it("uses the caller-owned path in validation failures", () => {
    expect(() =>
      parseOptionalOpenAIResponsesConfig({}, "Config intent.openai"),
    ).toThrow("Config intent.openai.model must be a non-empty string.");
  });
});
