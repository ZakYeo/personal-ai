import { interpretOnce } from "../../ports/intent.js";
import {
  createFetchStub,
  jsonResponse,
} from "../../test-support/adapter-contract.js";
import type { OpenAIIntentCapability } from "./openai-intent-interpreter.js";
import {
  createOpenAIIntentInterpreter as createInterpreter,
  openAIIntentContext as context,
  readOpenAIIntentRequestBody as readRequestBody,
} from "../../test-support/openai-intent.js";
import { deterministicTestNow } from "../../test-support/primitives.js";
import type { ConversationState } from "../../ports/conversation.js";

const internetSearchCapability: OpenAIIntentCapability = {
  capability: {
    description: "Search current public internet sources.",
    name: "internet.search",
    parameters: {
      query: {
        description: "The subject or question to search for.",
        required: true,
        type: "string",
      },
    },
    risk: "low",
  },
  featureId: "internetSearch",
  featureName: "Internet search",
  parameterText:
    "query: string (required; The subject or question to search for.)",
};

describe("OpenAIIntentInterpreter", () => {
  it("provides bounded prior conversation as untrusted routing context", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-history",
        output_text: JSON.stringify({
          interpretation: { kind: "conversation" },
        }),
      }),
    );
    const interpreter = createInterpreter({ fetch });
    const history: ConversationState = {
      recentTurns: [
        { content: "Search for Donald Trump's birthday.", role: "user" },
        { content: "His birthday is June 14, 1946.", role: "assistant" },
      ],
    };

    await interpretOnce(interpreter, "How old is he?", context, history);

    const body = readRequestBody(fetch);
    expect(JSON.stringify(body.input)).toContain("June 14, 1946");
    expect(JSON.stringify(body.input)).toContain("untrusted context only");
  });

  it("returns a command from structured provider output", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: JSON.stringify({
          interpretation: {
            kind: "command",
            command: {
              capability: "calendar.search_events",
              parameters: [{ name: "query", value: "upcoming wedding" }],
              rawText: "Hey Jarvis, check my calendar for the upcoming wedding",
            },
          },
        }),
      }),
    );
    const interpreter = createInterpreter({
      capabilityCatalog: [
        {
          capability: {
            name: "calendar.search_events",
            parameters: {
              endDate: { type: "string" },
              query: { type: "string" },
              startDate: { type: "string" },
            },
            risk: "low",
            toolChain: "read",
          },
          featureId: "calendar",
          featureName: "Mock Calendar",
          parameterText:
            "endDate: string (optional); query: string (optional); startDate: string (optional)",
        },
      ],
      fetch,
    });

    await expect(
      interpretOnce(
        interpreter,
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

    expect(JSON.stringify(body.input)).toContain("tool chain read");
    expect(JSON.stringify(body.input)).toContain(
      "Never ask for information represented only by optional capability parameters",
    );

    expect(body.text.format.schema).toMatchObject({
      $defs: {
        command: {
          additionalProperties: false,
          properties: {
            capability: {
              enum: ["calendar.search_events"],
            },
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
        plan: {
          additionalProperties: false,
          properties: {
            commands: { type: "array", minItems: 1, maxItems: 3 },
          },
          required: ["commands"],
        },
        response: {
          additionalProperties: false,
          required: ["status", "text"],
        },
      },
      additionalProperties: false,
      properties: {
        interpretation: { anyOf: expect.any(Array) as unknown },
      },
      required: ["interpretation"],
    });
    const variants = (
      body.text.format.schema as {
        properties: { interpretation: { anyOf: unknown[] } };
      }
    ).properties.interpretation.anyOf;
    expect(variants).toEqual([
      expect.objectContaining({
        additionalProperties: false,
        properties: {
          command: { $ref: "#/$defs/command" },
          kind: { enum: ["command"], type: "string" },
        },
        required: ["kind", "command"],
      }),
      expect.objectContaining({
        properties: {
          kind: { enum: ["plan"], type: "string" },
          plan: { $ref: "#/$defs/plan" },
        },
        required: ["kind", "plan"],
      }),
      expect.objectContaining({
        additionalProperties: false,
        properties: {
          kind: { enum: ["conversation"], type: "string" },
        },
        required: ["kind"],
      }),
      expect.objectContaining({
        additionalProperties: false,
        properties: {
          clarificationCapability: {
            enum: ["calendar.search_events"],
            type: "string",
          },
          kind: { enum: ["clarification"], type: "string" },
          response: { $ref: "#/$defs/response" },
        },
        required: ["kind", "clarificationCapability", "response"],
      }),
      expect.objectContaining({
        properties: {
          kind: { enum: ["rephrase"], type: "string" },
          response: { $ref: "#/$defs/response" },
        },
        required: ["kind", "response"],
      }),
      expect.objectContaining({
        properties: {
          kind: { enum: ["replacement"], type: "string" },
        },
        required: ["kind"],
      }),
      expect.objectContaining({
        properties: {
          kind: { enum: ["unknown"], type: "string" },
          response: { $ref: "#/$defs/response" },
        },
        required: ["kind", "response"],
      }),
      expect.objectContaining({
        properties: {
          kind: { enum: ["unsupported"], type: "string" },
          response: { $ref: "#/$defs/response" },
        },
        required: ["kind", "response"],
      }),
    ]);
    expect(body.text.format.schema).not.toHaveProperty("anyOf");
    expect(JSON.stringify(body.input)).toContain("calendar.search_events");
    expect(JSON.stringify(body.input)).toContain("query: string (optional)");
    expect(JSON.stringify(body.input)).toContain(
      "Questions about the assistant's enabled capabilities must use the enabled assistant capability that lists them when one is present.",
    );
    expect(JSON.stringify(body.input)).toContain(
      "Use kind command with the exact enabled capability name",
    );
    expect(JSON.stringify(body.input)).toContain(
      `Current time: ${deterministicTestNow.toISOString()}.`,
    );
    expect(JSON.stringify(body.input)).toContain(
      "Assistant time zone: Europe/London.",
    );
    expect(JSON.stringify(body.input)).toContain(
      "Resolve relative dates and times into exact capability parameters",
    );
  });

  it("omits unavailable clarification variants and instructions", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: JSON.stringify({
          interpretation: { kind: "conversation" },
        }),
      }),
    );
    const interpreter = createInterpreter({ capabilityCatalog: [], fetch });

    await interpretOnce(interpreter, "Thank you.", context);

    const body = readRequestBody(fetch);
    const requestText = JSON.stringify(body.input);
    const variants = (
      body.text.format.schema as {
        properties: {
          interpretation: {
            anyOf: Array<{ properties: { kind: { enum: string[] } } }>;
          };
        };
      }
    ).properties.interpretation.anyOf;
    expect(variants.map((variant) => variant.properties.kind.enum[0])).toEqual([
      "command",
      "plan",
      "conversation",
      "rephrase",
      "replacement",
      "unknown",
      "unsupported",
    ]);
    expect(requestText).not.toContain("kind clarification");
    expect(requestText).toContain("kind rephrase");
  });

  it("returns a conversation classification from structured provider output", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: JSON.stringify({
          interpretation: { kind: "conversation" },
        }),
      }),
    );
    const interpreter = createInterpreter({ fetch });

    await expect(
      interpretOnce(interpreter, "Hey Jarvis, how are you today?", context),
    ).resolves.toEqual({
      kind: "conversation",
    });
  });

  it("returns an open rephrase prompt for an incomplete request", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: JSON.stringify({
          interpretation: {
            kind: "rephrase",
            response: {
              status: "ok",
              text: "What would you like me to do?",
            },
          },
        }),
      }),
    );
    const interpreter = createInterpreter({ fetch });

    await expect(
      interpretOnce(interpreter, "Can you do", context),
    ).resolves.toEqual({
      kind: "rephrase",
      response: { status: "ok", text: "What would you like me to do?" },
    });

    expect(JSON.stringify(readRequestBody(fetch).input)).toContain(
      "Use kind rephrase with an ok response when the request is too incomplete to select a specific workflow",
    );
  });

  it.each(["unknown", "unsupported"] as const)(
    "rejects an inactive command on a %s response",
    async (kind) => {
      const fetch = createFetchStub(
        jsonResponse({
          id: "response-1",
          output_text: JSON.stringify({
            interpretation: {
              command: {
                capability: "internet.search",
                parameters: [{ name: "query", value: "can you search" }],
                rawText: "Can you search the web for me?",
              },
              kind,
              response: {
                status: kind,
                text: "What would you like me to search for?",
              },
            },
          }),
        }),
      );
      const interpreter = createInterpreter({
        capabilityCatalog: [internetSearchCapability],
        fetch,
      });

      await expect(
        interpretOnce(interpreter, "Can you search the web for me?", context),
      ).rejects.toThrow(
        `OpenAI intent ${kind} response fields must be kind, response.`,
      );
    },
  );

  it("instructs the provider to clarify capability requests missing required user information", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: JSON.stringify({
          interpretation: {
            clarificationCapability: "internet.search",
            kind: "clarification",
            response: {
              status: "ok",
              text: "What would you like me to search for?",
            },
          },
        }),
      }),
    );
    const interpreter = createInterpreter({
      capabilityCatalog: [internetSearchCapability],
      fetch,
    });

    await interpretOnce(interpreter, "Can you search?", context);

    const input = JSON.stringify(readRequestBody(fetch).input);
    expect(input).toContain(
      "When a capability matches but required information is missing",
    );
    expect(input).toContain(
      "Never fill a required parameter with words that merely restate the capability request",
    );
    expect(input).toContain(
      "A user asking whether you can perform an enabled capability without supplying its required information is starting that capability",
    );
    expect(input).toContain("The subject or question to search for.");
    expect(input).toContain(
      "A question about one named action is not a broad capability-catalog question",
    );
    expect(input).toContain(
      "An incomplete modal fragment such as 'can you do'",
    );
    expect(input).toContain("If one matches, never use kind rephrase");
    expect(input).toContain(
      "Choose by the requested object or domain, not by a generic verb",
    );
  });
});
