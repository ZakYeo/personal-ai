import { jsonResponse } from "../../test-support/adapter-contract.js";
import { requestOpenAIResponse } from "./openai-responses-client.js";

describe("requestOpenAIResponse", () => {
  it("applies shared Responses API request policy with a labeled operation", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ output: [] }));

    await expect(
      requestOpenAIResponse({
        body: { input: "hello" },
        config: {
          apiKeyEnv: "OPENAI_API_KEY",
          baseUrl: "https://openai.test/v1/",
          model: "gpt-test",
          timeoutMs: 1000,
        },
        createError: ({ message }) => new Error(message),
        env: { OPENAI_API_KEY: "secret" },
        fetch: fetch as typeof globalThis.fetch,
        operation: "conversation",
      }),
    ).resolves.toEqual({ output: [] });
    expect(fetch).toHaveBeenCalledWith(
      "https://openai.test/v1/responses",
      expect.objectContaining({
        body: JSON.stringify({ input: "hello" }),
        method: "POST",
      }),
    );
  });

  it("uses the operation label in provider failures", async () => {
    await expect(
      requestOpenAIResponse({
        body: {},
        config: {
          apiKeyEnv: "OPENAI_API_KEY",
          baseUrl: "https://openai.test/v1",
          model: "gpt-test",
          timeoutMs: 1000,
        },
        createError: ({ message }) => new Error(message),
        env: { OPENAI_API_KEY: "secret" },
        fetch: vi
          .fn()
          .mockResolvedValue(new Response("failure", { status: 500 })),
        operation: "response rewrite",
      }),
    ).rejects.toThrow(
      "OpenAI response rewrite request failed with status 500.",
    );
  });
});
