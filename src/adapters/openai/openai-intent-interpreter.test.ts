import type { AssistantContext } from "../../ports/assistant.js";
import { OpenAIIntentInterpreter } from "./openai-intent-interpreter.js";
import type { OpenAIIntentError } from "./openai-intent-interpreter.js";

const context = {
  clock: {
    now: () => new Date("2026-06-26T09:00:00.000Z"),
  },
  config: {
    assistant: {
      name: "Jarvis",
      wakePhrases: ["hey jarvis"],
    },
    intent: {
      provider: "openai",
      openai: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.test/v1",
        model: "gpt-5.5",
        timeoutMs: 30_000,
      },
    },
    features: {
      calendar: { enabled: true, adapter: "mock" },
    },
  },
} satisfies AssistantContext;

describe("OpenAIIntentInterpreter", () => {
  it("returns a command from structured provider output", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        output_text: JSON.stringify({
          command: {
            capability: "calendar.search_events",
            parameters: {
              query: "upcoming wedding",
            },
            rawText: "Hey Jarvis, check my calendar for the upcoming wedding",
          },
        }),
      }),
    );
    const interpreter = createInterpreter({ fetch });

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
  });

  it("returns a response from structured provider output", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        output_text: JSON.stringify({
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
      response: {
        status: "unknown",
        text: "I could not map that to a command.",
      },
    });
  });

  it("extracts text from Responses API output content", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        output: [
          {
            content: [
              {
                text: JSON.stringify({
                  command: {
                    capability: "alarm.list",
                    parameters: {},
                    rawText: "Hey Jarvis, list my alarms",
                  },
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
    });
  });

  it("rejects missing API keys before calling the provider", async () => {
    const fetch = vi.fn();
    const interpreter = createInterpreter({ env: {}, fetch });

    await expect(
      interpreter.interpret("Hey Jarvis, list my alarms", context),
    ).rejects.toThrow(
      "OpenAI API key environment variable OPENAI_API_KEY is not set.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects non-2xx provider responses with status diagnostics", async () => {
    const interpreter = createInterpreter({
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
          status: 429,
          statusText: "Too Many Requests",
        }),
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

  it("rejects malformed provider JSON output", async () => {
    const interpreter = createInterpreter({
      fetch: vi.fn().mockResolvedValue(
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
      fetch: vi.fn().mockResolvedValue(
        jsonResponse({
          output_text: JSON.stringify({
            command: {
              capability: "alarm.create",
              parameters: {
                nested: { unsafe: true },
              },
              rawText: "Hey Jarvis, set an alarm",
            },
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

  it("aborts requests that exceed the configured timeout", async () => {
    const fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
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
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function createInterpreter(options: CreateInterpreterOptions = {}) {
  return new OpenAIIntentInterpreter({
    config: {
      apiKeyEnv: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.test/v1",
      model: "gpt-5.5",
      timeoutMs: options.timeoutMs ?? 30_000,
    },
    env: options.env ?? { OPENAI_API_KEY: "test-api-key" },
    fetch: options.fetch ?? vi.fn(),
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status: 200,
  });
}
