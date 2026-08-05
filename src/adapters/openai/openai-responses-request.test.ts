import type { OpenAIResponsesRequestBody } from "./openai-responses-request.js";

describe("OpenAI Responses request contract", () => {
  it("models valid manually managed conversation history", () => {
    const request: OpenAIResponsesRequestBody = {
      input: [
        { content: "How are you?", role: "user" },
        { content: "I am doing well.", role: "assistant" },
      ],
      model: "gpt-test",
    };

    expect(request.input).toHaveLength(2);
  });

  it("rejects input_text content on assistant history messages at compile time", () => {
    const invalidRequest: OpenAIResponsesRequestBody = {
      input: [
        // @ts-expect-error assistant history must not contain input_text content.
        {
          content: [{ text: "I am doing well.", type: "input_text" }],
          role: "assistant",
        },
      ],
      model: "gpt-test",
    };

    expect(invalidRequest.model).toBe("gpt-test");
  });
});
