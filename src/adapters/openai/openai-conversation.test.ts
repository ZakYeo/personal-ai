import type { AssistantContext } from "../../ports/assistant.js";
import type { ConversationState } from "../../ports/conversation.js";
import {
  createAbortingFetchStub,
  createFetchStub,
  createMissingProviderCredentialEnv,
  createProviderCredentialEnv,
  jsonResponse,
  malformedJsonResponse,
  providerErrorResponse,
  readJsonRequestBody,
} from "../../test-support/adapter-contract.js";
import { deterministicTestNow } from "../../test-support/primitives.js";
import {
  OpenAIConversationCompactor,
  OpenAIConversationResponder,
} from "./openai-conversation.js";
import type { OpenAIConversationError } from "./openai-conversation-error.js";

const context = {
  clock: {
    now: () => deterministicTestNow,
  },
  config: {
    assistant: {
      name: "Jarvis",
      wakePhrases: ["hey jarvis"],
    },
    features: {},
  },
} satisfies AssistantContext;

const state: ConversationState = {
  recentTurns: [
    { content: "How are you?", role: "user" },
    { content: "I am doing well.", role: "assistant" },
  ],
  summary: "The user is checking in casually.",
};

describe("OpenAIConversationResponder", () => {
  it("returns a safe assistant response from structured provider output", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        output_text: JSON.stringify({
          text: "I am doing well today.",
        }),
      }),
    );
    const responder = createResponder({ fetch });

    await expect(
      responder.respond("Hey Jarvis, how are you today?", state, context),
    ).resolves.toEqual({
      status: "ok",
      text: "I am doing well today.",
    });

    const body = readRequestBody(fetch);

    expect(body.text.format.schema).toMatchObject({
      additionalProperties: false,
      properties: {
        text: { type: "string" },
      },
      required: ["text"],
    });
    expect(JSON.stringify(body.input)).toContain(
      "Summary:\\nThe user is checking in casually.",
    );
    expect(JSON.stringify(body.input)).toContain("user: How are you?");
  });

  it("rejects missing API keys before calling the provider", async () => {
    const fetch = vi.fn();
    const responder = createResponder({
      env: createMissingProviderCredentialEnv(),
      fetch,
    });

    await expect(
      responder.respond("How are you?", { recentTurns: [] }, context),
    ).rejects.toThrow(
      "OpenAI API key environment variable OPENAI_API_KEY is not set.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects non-2xx provider responses with status diagnostics", async () => {
    const responder = createResponder({
      fetch: createFetchStub(
        providerErrorResponse(
          429,
          { error: { message: "quota exceeded" } },
          "Too Many Requests",
        ),
      ),
    });

    await expect(
      responder.respond("How are you?", { recentTurns: [] }, context),
    ).rejects.toMatchObject({
      message: "OpenAI conversation request failed with status 429.",
      responseBody: '{"error":{"message":"quota exceeded"}}',
      status: 429,
    } satisfies Partial<OpenAIConversationError>);
  });

  it("rejects malformed provider response bodies", async () => {
    const responder = createResponder({
      fetch: createFetchStub(malformedJsonResponse("{not-json")),
    });

    await expect(
      responder.respond("How are you?", { recentTurns: [] }, context),
    ).rejects.toMatchObject({
      message: "OpenAI conversation response body was not valid JSON.",
      responseBody: "{not-json",
      status: 200,
    } satisfies Partial<OpenAIConversationError>);
  });

  it("rejects malformed provider output text", async () => {
    const responder = createResponder({
      fetch: createFetchStub(
        jsonResponse({
          output_text: "{not-json",
        }),
      ),
    });

    await expect(
      responder.respond("How are you?", { recentTurns: [] }, context),
    ).rejects.toThrow("OpenAI conversation response was not valid JSON.");
  });

  it("aborts requests that exceed the configured timeout", async () => {
    const responder = createResponder({
      fetch: createAbortingFetchStub(),
      timeoutMs: 1,
    });

    await expect(
      responder.respond("How are you?", { recentTurns: [] }, context),
    ).rejects.toThrow("OpenAI conversation request timed out after 1ms.");
  });
});

describe("OpenAIConversationCompactor", () => {
  it("compacts conversation state into a provider summary", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        output_text: JSON.stringify({
          summary: "The user asked how Jarvis was doing.",
        }),
      }),
    );
    const compactor = createCompactor({ fetch });

    await expect(compactor.compact(state, context)).resolves.toEqual({
      recentTurns: [],
      summary: "The user asked how Jarvis was doing.",
    });

    const body = readRequestBody(fetch);

    expect(body.text.format.schema).toMatchObject({
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
    });
    expect(JSON.stringify(body.input)).toContain("Summarize Jarvis");
  });
});

interface CreateConversationOptions {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function createResponder(options: CreateConversationOptions = {}) {
  return new OpenAIConversationResponder(createOptions(options));
}

function createCompactor(options: CreateConversationOptions = {}) {
  return new OpenAIConversationCompactor(createOptions(options));
}

function createOptions(options: CreateConversationOptions = {}) {
  return {
    config: {
      apiKeyEnv: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.test/v1",
      model: "gpt-5.5",
      timeoutMs: options.timeoutMs ?? 30_000,
    },
    env:
      options.env ??
      createProviderCredentialEnv("OPENAI_API_KEY", "test-api-key"),
    fetch: options.fetch ?? vi.fn(),
  };
}

interface RequestBody {
  input: unknown;
  text: {
    format: {
      schema: unknown;
    };
  };
}

function readRequestBody(fetch: typeof globalThis.fetch): RequestBody {
  return readJsonRequestBody<RequestBody>(fetch);
}
