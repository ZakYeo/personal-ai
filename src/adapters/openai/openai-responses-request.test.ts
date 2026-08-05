import type {
  OpenAIIntentRequestBody,
  OpenAIResponsesPlainTextMessage,
  OpenAIWebSearchRequestBody,
} from "./openai-responses-request.js";

describe("OpenAI Responses request contract", () => {
  it("models valid manually managed conversation history", () => {
    const request: OpenAIIntentRequestBody = {
      input: [
        { content: "How are you?", role: "user" },
        { content: "I am doing well.", role: "assistant" },
      ],
      model: "gpt-test",
      text: jsonSchemaOutput,
    };

    expect(request.input).toHaveLength(2);
  });

  it("models plain text independently of the message role", () => {
    const messages: OpenAIResponsesPlainTextMessage[] = [
      { content: "System guidance", role: "system" },
      { content: "Developer guidance", role: "developer" },
      { content: "User request", role: "user" },
      { content: "Assistant answer", role: "assistant" },
    ];

    expect(messages).toHaveLength(4);
  });

  it("rejects input_text content on assistant history messages at compile time", () => {
    const invalidRequest: OpenAIIntentRequestBody = {
      input: [
        // @ts-expect-error assistant history must not contain input_text content.
        {
          content: [{ text: "I am doing well.", type: "input_text" }],
          role: "assistant",
        },
      ],
      model: "gpt-test",
      text: jsonSchemaOutput,
    };

    expect(invalidRequest.model).toBe("gpt-test");
  });

  it("rejects unknown top-level provider fields at compile time", () => {
    const invalidRequest: OpenAIWebSearchRequestBody = {
      input: "hello",
      model: "gpt-test",
      // @ts-expect-error misspelled provider fields must not cross the boundary.
      tool_choices: "required",
      tool_choice: "required",
      tools: [{ search_context_size: "low", type: "web_search" }],
    };

    expect(invalidRequest.model).toBe("gpt-test");
  });
});

const jsonSchemaOutput = {
  format: {
    name: "test_output",
    schema: { type: "object" },
    strict: true,
    type: "json_schema",
  },
} as const;
