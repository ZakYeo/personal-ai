import type { AssistantContext } from "../../ports/assistant.js";
import { createOpenAIConversationRequestBody } from "./openai-conversation-request.js";
import { createOpenAIIntentRequestBody } from "./openai-intent-request.js";
import { createOpenAIResponseRewriteRequestBody } from "./openai-response-rewriter-request.js";

const context = {
  clock: { now: () => new Date("2026-08-05T12:00:00.000Z") },
  config: {
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    features: {},
  },
  personalization: {
    preferredName: "Zak",
    responseStyle: "concise",
  },
} satisfies AssistantContext;

const config = {
  apiKeyEnv: "OPENAI_API_KEY",
  baseUrl: "https://api.openai.test/v1",
  model: "gpt-test",
  timeoutMs: 30_000,
};

describe("OpenAI personalization instructions", () => {
  it("includes the same narrow personalization in intent, conversation, and rewrite system contexts", () => {
    const intent = createOpenAIIntentRequestBody("hello", context, config, []);
    const conversation = createOpenAIConversationRequestBody(
      "hello",
      { recentTurns: [] },
      context,
      config,
    );
    const rewrite = createOpenAIResponseRewriteRequestBody(
      {
        capability: "test.echo",
        command: { capability: "test.echo", parameters: {}, rawText: "hello" },
        originalText: "hello",
        response: { status: "ok", text: "Hello." },
      },
      context,
      config,
    );

    for (const body of [intent, conversation, rewrite]) {
      expect(JSON.stringify(body.input)).toContain(
        'User personalization data: {\\"preferredName\\":\\"Zak\\",\\"responseStyle\\":\\"concise\\"}.',
      );
    }
  });
});
