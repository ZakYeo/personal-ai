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
import type { OpenAIResponsesRequestBody } from "./openai-responses-request.js";

const context = {
  clock: {
    now: () => deterministicTestNow,
  },
  config: {
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
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
  protectedFacts: [
    {
      names: ["date"],
      spokenForm: "date",
      token: "__ASSISTANT_PROTECTED_FACT_0__",
    },
  ],
  response: {
    citations: [
      {
        title: "Private link target",
        url: "https://example.com/private-citation-target",
      },
    ],
    status: "ok" as const,
    text: "Your upcoming calendar events are: Dentist on __ASSISTANT_PROTECTED_FACT_0__.",
  },
} satisfies ResponseRewriteRequest;

describe("OpenAIResponseRewriter", () => {
  it("returns rewritten text from structured provider output", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        output_text: JSON.stringify({
          text: "Your next calendar event is Dentist on __ASSISTANT_PROTECTED_FACT_0__.",
        }),
      }),
    );
    const rewriter = createRewriter({ fetch });

    await expect(rewriter.rewrite(request, context)).resolves.toEqual({
      text: "Your next calendar event is Dentist on __ASSISTANT_PROTECTED_FACT_0__.",
    });

    const body = readRequestBody(fetch);
    expect(body.reasoning).toEqual({ effort: "none" });
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
      "Preserve every token exactly",
    );
    expect(JSON.stringify(body.input)).toContain(
      "approved exact or relative-date renderings",
    );
    expect(JSON.stringify(body.input)).toContain(
      "natural, conversational dates and local times",
    );
    expect(JSON.stringify(body.input)).toContain(
      "Assistant time zone: Europe/London",
    );
    if (typeof body.input === "string") {
      throw new TypeError("Expected response rewrite input messages.");
    }
    const userMessage = body.input[1];
    if (
      !userMessage ||
      !("content" in userMessage) ||
      typeof userMessage.content === "string"
    ) {
      throw new TypeError("Expected a structured user message.");
    }
    expect(JSON.parse(userMessage.content[0]!.text)).toMatchObject({
      protectedFacts: [{ spokenForm: "date" }],
    });
    expect(JSON.stringify(body.input)).toContain(
      "Never include raw URLs, Markdown links, citation brackets, or internal identifiers in spoken text",
    );
    expect(JSON.stringify(body.input)).toContain("Do not invent events");
    expect(JSON.stringify(body.input)).toContain(
      "__ASSISTANT_PROTECTED_FACT_0__",
    );
    expect(JSON.stringify(body.input)).not.toContain("2026-09-12");
    expect(JSON.stringify(body.input)).not.toContain("private-citation-target");
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
    const output = JSON.stringify({ text: "" });
    const rewriter = createRewriter({
      fetch: createFetchStub(
        jsonResponse({
          output_text: output,
        }),
      ),
    });

    await expect(rewriter.rewrite(request, context)).rejects.toMatchObject({
      message: "OpenAI response rewrite text must be a non-empty string.",
      responseBody: output,
    } satisfies Partial<OpenAIResponseRewriterError>);
  });

  it.each([
    "Read https://example.com/private aloud.",
    "Observed at 2026-08-04T15:00:00.000Z.",
    "Scheduled in Europe/London.",
  ])("rejects unsafe rewritten spoken text: %s", async (text) => {
    const rewriter = createRewriter({
      fetch: createFetchStub(
        jsonResponse({
          output_text: JSON.stringify({
            text,
          }),
        }),
      ),
    });

    await expect(rewriter.rewrite(request, context)).rejects.toThrow(
      "OpenAI response rewrite text must be suitable for spoken delivery.",
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
      reasoningEffort: "none" as const,
      timeoutMs: 30_000,
    },
    env:
      options.env ??
      createProviderCredentialEnv("OPENAI_API_KEY", "test-openai-api-key"),
    fetch: options.fetch ?? vi.fn(),
  });
}

interface OpenAIResponseRewriteRequestBody extends OpenAIResponsesRequestBody {
  reasoning?: { effort: string };
  text: { format: { schema: unknown } };
}

function readRequestBody(
  fetch: typeof globalThis.fetch,
): OpenAIResponseRewriteRequestBody {
  return readJsonRequestBody<OpenAIResponseRewriteRequestBody>(fetch);
}
