import type { AssistantContext } from "../../ports/assistant.js";
import type { ResponseRewriteRequest } from "../../ports/response-rewriter.js";
import {
  createFetchStub,
  createMissingProviderCredentialEnv,
  createProviderCredentialEnv,
  jsonResponse,
  malformedJsonResponse,
  providerErrorResponse,
  readJsonRequestBody,
} from "../../test-support/adapter-contract.js";
import { deterministicTestNow } from "../../test-support/primitives.js";
import { OpenAIResponseRewriter } from "./openai-response-rewriter.js";
import type { OpenAIResponseRewriterError } from "./openai-response-rewriter.js";

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

const request = {
  capability: "calendar.search_events",
  command: {
    capability: "calendar.search_events",
    parameters: {},
    rawText: "Can you list my upcoming calendar events please?",
  },
  originalText: "Can you list my upcoming calendar events please?",
  response: {
    status: "ok" as const,
    text: "Your upcoming calendar events are: Dentist on 2026-09-12.",
  },
} satisfies ResponseRewriteRequest;

describe("OpenAIResponseRewriter", () => {
  it("returns rewritten text from structured provider output", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        output_text: JSON.stringify({
          text: "Your next calendar event is Dentist on 12th September 2026.",
        }),
      }),
    );
    const rewriter = createRewriter({ fetch });

    await expect(rewriter.rewrite(request, context)).resolves.toEqual({
      text: "Your next calendar event is Dentist on 12th September 2026.",
    });

    const body = readRequestBody(fetch);
    expect(body.text.format.schema).toEqual({
      additionalProperties: false,
      properties: {
        text: { type: "string" },
      },
      required: ["text"],
      type: "object",
    });
    expect(JSON.stringify(body.input)).toContain(
      "Preserve every factual claim",
    );
    expect(JSON.stringify(body.input)).toContain(
      "make title-shaped event names conversational",
    );
    expect(JSON.stringify(body.input)).toContain(
      "avoid saying the year unless the user needs it",
    );
    expect(JSON.stringify(body.input)).toContain("Do not invent events");
    expect(JSON.stringify(body.input)).toContain("2026-09-12");
    expect(JSON.stringify(body.input)).toContain("calendar.search_events");
  });

  it("rejects missing OpenAI credentials before calling the provider", async () => {
    const fetch = vi.fn();
    const rewriter = createRewriter({
      env: createMissingProviderCredentialEnv(),
      fetch,
    });

    await expect(rewriter.rewrite(request, context)).rejects.toThrow(
      "OpenAI API key environment variable OPENAI_API_KEY is not set.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects provider failures with status diagnostics", async () => {
    const rewriter = createRewriter({
      fetch: createFetchStub(
        providerErrorResponse(
          429,
          { error: { message: "quota exceeded" } },
          "Too Many Requests",
        ),
      ),
    });

    await expect(rewriter.rewrite(request, context)).rejects.toMatchObject({
      message: "OpenAI response rewrite request failed with status 429.",
      responseBody: '{"error":{"message":"quota exceeded"}}',
      status: 429,
    } satisfies Partial<OpenAIResponseRewriterError>);
  });

  it("rejects malformed provider JSON", async () => {
    const rewriter = createRewriter({
      fetch: createFetchStub(malformedJsonResponse("{not-json")),
    });

    await expect(rewriter.rewrite(request, context)).rejects.toMatchObject({
      message: "OpenAI response rewrite response body was not valid JSON.",
      responseBody: "{not-json",
      status: 200,
    } satisfies Partial<OpenAIResponseRewriterError>);
  });

  it("rejects malformed structured rewrite output", async () => {
    const rewriter = createRewriter({
      fetch: createFetchStub(
        jsonResponse({
          output_text: JSON.stringify({ text: "" }),
        }),
      ),
    });

    await expect(rewriter.rewrite(request, context)).rejects.toThrow(
      "OpenAI response rewrite text must be a non-empty string.",
    );
  });
});

interface CreateRewriterOptions {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

function createRewriter(options: CreateRewriterOptions = {}) {
  return new OpenAIResponseRewriter({
    config: {
      apiKeyEnv: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.test/v1",
      model: "gpt-test",
      timeoutMs: 30_000,
    },
    env:
      options.env ??
      createProviderCredentialEnv("OPENAI_API_KEY", "test-openai-api-key"),
    fetch: options.fetch ?? vi.fn(),
  });
}

function readRequestBody(fetch: typeof globalThis.fetch): {
  input: unknown;
  text: { format: { schema: unknown } };
} {
  return readJsonRequestBody(fetch);
}
