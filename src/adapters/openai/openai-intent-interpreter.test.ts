import type { AssistantContext } from "../../ports/assistant.js";
import {
  createAbortingFetchStub,
  createFetchStub,
  createMissingProviderCredentialEnv,
  createProviderCredentialEnv,
  createProviderTransportFailureFetchStub,
  jsonResponse,
  malformedJsonResponse,
  providerErrorResponse,
} from "../../test-support/adapter-contract.js";
import { deterministicTestNow } from "../../test-support/primitives.js";
import { OpenAIIntentInterpreter } from "./openai-intent-interpreter.js";
import type {
  OpenAIIntentCapability,
  OpenAIIntentError,
} from "./openai-intent-interpreter.js";

const context = {
  clock: {
    now: () => deterministicTestNow,
  },
  config: {
    assistant: {
      name: "Jarvis",
      wakePhrases: ["hey jarvis"],
    },
    features: {
      calendar: { enabled: true },
    },
  },
} satisfies AssistantContext;

describe("OpenAIIntentInterpreter", () => {
  it("returns a command from structured provider output", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        output_text: JSON.stringify({
          kind: "command",
          command: {
            capability: "calendar.search_events",
            parameters: [{ name: "query", value: "upcoming wedding" }],
            rawText: "Hey Jarvis, check my calendar for the upcoming wedding",
          },
          response: null,
        }),
      }),
    );
    const interpreter = createInterpreter({
      capabilityCatalog: [
        {
          capability: {
            name: "calendar.search_events",
            parameters: {
              query: { type: "string", required: true },
            },
            risk: "low",
          },
          featureId: "calendar",
          featureName: "Mock Calendar",
        },
      ],
      fetch,
    });

    await expect(
      interpreter.interpret(
        "Hey Jarvis, check my calendar for the upcoming wedding",
        context,
      ),
    ).resolves.toEqual({
      command: {
        capability: "calendar.search_events",
        parameters: {
          query: "upcoming wedding",
        },
        rawText: "Hey Jarvis, check my calendar for the upcoming wedding",
      },
      kind: "command",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.test/v1/responses",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer test-api-key",
          "content-type": "application/json",
        }) as Record<string, string>,
        method: "POST",
      }),
    );

    const body = readRequestBody(fetch);

    expect(body.text.format.schema).toMatchObject({
      additionalProperties: false,
      properties: {
        command: {
          type: ["object", "null"],
          properties: {
            parameters: {
              type: "array",
              items: {
                additionalProperties: false,
                required: ["name", "value"],
              },
            },
          },
          required: ["capability", "parameters", "rawText"],
        },
        kind: {
          enum: ["command", "response"],
        },
        response: {
          type: ["object", "null"],
          required: ["status", "text"],
        },
      },
      required: ["kind", "command", "response"],
    });
    expect(body.text.format.schema).not.toHaveProperty("anyOf");
    expect(JSON.stringify(body.input)).toContain("calendar.search_events");
    expect(JSON.stringify(body.input)).toContain("query: string (required)");
  });

  it("returns a response from structured provider output", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        output_text: JSON.stringify({
          kind: "response",
          command: null,
          response: {
            status: "unknown",
            text: "I could not map that to a command.",
          },
        }),
      }),
    );
    const interpreter = createInterpreter({ fetch });

    await expect(
      interpreter.interpret("Hey Jarvis, do something unusual", context),
    ).resolves.toEqual({
      kind: "unknown",
      response: {
        status: "unknown",
        text: "I could not map that to a command.",
      },
    });
  });

  it("extracts text from Responses API output content", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        output: [
          {
            content: [
              {
                text: JSON.stringify({
                  kind: "command",
                  command: {
                    capability: "alarm.list",
                    parameters: [],
                    rawText: "Hey Jarvis, list my alarms",
                  },
                  response: null,
                }),
              },
            ],
          },
        ],
      }),
    );
    const interpreter = createInterpreter({ fetch });

    await expect(
      interpreter.interpret("Hey Jarvis, list my alarms", context),
    ).resolves.toEqual({
      command: {
        capability: "alarm.list",
        parameters: {},
        rawText: "Hey Jarvis, list my alarms",
      },
      kind: "command",
    });
  });

  it("rejects missing API keys before calling the provider", async () => {
    const fetch = vi.fn();
    const interpreter = createInterpreter({
      env: createMissingProviderCredentialEnv(),
      fetch,
    });

    await expect(
      interpreter.interpret("Hey Jarvis, list my alarms", context),
    ).rejects.toThrow(
      "OpenAI API key environment variable OPENAI_API_KEY is not set.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects non-2xx provider responses with status diagnostics", async () => {
    const interpreter = createInterpreter({
      fetch: createFetchStub(
        providerErrorResponse(
          429,
          { error: { message: "quota exceeded" } },
          "Too Many Requests",
        ),
      ),
    });

    await expect(
      interpreter.interpret("Hey Jarvis, list my alarms", context),
    ).rejects.toMatchObject({
      message: "OpenAI intent request failed with status 429.",
      responseBody: '{"error":{"message":"quota exceeded"}}',
      status: 429,
    } satisfies Partial<OpenAIIntentError>);
  });

  it("rejects provider response bodies that are not JSON with diagnostics", async () => {
    const interpreter = createInterpreter({
      fetch: createFetchStub(malformedJsonResponse("{not-json")),
    });

    await expect(
      interpreter.interpret("Hey Jarvis, list my alarms", context),
    ).rejects.toMatchObject({
      message: "OpenAI intent response body was not valid JSON.",
      responseBody: "{not-json",
      status: 200,
    } satisfies Partial<OpenAIIntentError>);
  });

  it("rejects malformed provider JSON output", async () => {
    const interpreter = createInterpreter({
      fetch: createFetchStub(
        jsonResponse({
          output_text: "{not-json",
        }),
      ),
    });

    await expect(
      interpreter.interpret("Hey Jarvis, list my alarms", context),
    ).rejects.toThrow("OpenAI intent response was not valid JSON.");
  });

  it("rejects provider output that does not match intent shape", async () => {
    const interpreter = createInterpreter({
      fetch: createFetchStub(
        jsonResponse({
          output_text: JSON.stringify({
            kind: "command",
            command: {
              capability: "alarm.create",
              parameters: [{ name: "nested", value: { unsafe: true } }],
              rawText: "Hey Jarvis, set an alarm",
            },
            response: null,
          }),
        }),
      ),
    });

    await expect(
      interpreter.interpret("Hey Jarvis, set an alarm", context),
    ).rejects.toThrow(
      "OpenAI intent response parameters must be scalar values.",
    );
  });

  it("rejects transport failures without replacing the provider diagnostic", async () => {
    const error = new TypeError("network unavailable");
    const interpreter = createInterpreter({
      fetch: createProviderTransportFailureFetchStub(error),
    });

    await expect(
      interpreter.interpret("Hey Jarvis, list my alarms", context),
    ).rejects.toBe(error);
  });

  it("aborts requests that exceed the configured timeout", async () => {
    const fetch = createAbortingFetchStub();
    const interpreter = createInterpreter({
      fetch,
      timeoutMs: 1,
    });

    await expect(
      interpreter.interpret("Hey Jarvis, list my alarms", context),
    ).rejects.toThrow("OpenAI intent request timed out after 1ms.");
  });
});

interface CreateInterpreterOptions {
  capabilityCatalog?: OpenAIIntentCapability[];
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function createInterpreter(options: CreateInterpreterOptions = {}) {
  return new OpenAIIntentInterpreter({
    ...(options.capabilityCatalog
      ? { capabilityCatalog: options.capabilityCatalog }
      : {}),
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
  });
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
  const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as
    | RequestInit
    | undefined;
  const body = init?.body;

  if (typeof body !== "string") {
    throw new TypeError("Expected JSON request body.");
  }

  return JSON.parse(body) as RequestBody;
}
