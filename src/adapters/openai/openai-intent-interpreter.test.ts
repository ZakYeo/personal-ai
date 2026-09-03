import { interpretOnce } from "../../application/intent.js";
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

const profileLookupCapability: OpenAIIntentCapability = {
  capability: {
    description:
      "Read one explicitly stored personal profile fact needed for the current request.",
    name: "profile.lookup",
    parameters: {
      field: {
        allowedValues: ["name", "homeLocation"],
        description: "The one bounded profile field required by the request.",
        required: true,
        type: "string",
      },
    },
    risk: "low",
    toolChain: "read",
    toolOnly: true,
  },
  featureId: "profile",
  featureName: "Personal profile",
  parameterText:
    "field: string (required; The one bounded profile field required by the request.)",
};

describe("OpenAIIntentInterpreter", () => {
  it("describes open outfit requests without requiring an optional item", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-weather-clothing",
        output_text: JSON.stringify({
          interpretation: { kind: "conversation" },
        }),
      }),
    );
    const interpreter = createInterpreter({
      capabilityCatalog: [
        {
          capability: {
            name: "weather.clothing",
            parameters: {
              goal: {
                allowedValues: ["assess_item", "recommend_outfit"],
                required: true,
                type: "string",
              },
              item: { type: "string" },
            },
            risk: "low",
          },
          featureId: "weather",
          featureName: "Weather",
          parameterText: "goal: string (required); item: string (optional)",
        },
      ],
      fetch,
    });

    await interpretOnce(
      interpreter,
      "What would you recommend I wear?",
      context,
    );

    expect(JSON.stringify(readRequestBody(fetch).input)).toContain(
      "use goal recommend_outfit when the user broadly asks what to wear and omit the optional item",
    );
  });

  it("provides safe recent weather-location context without private coordinates", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-weather-reference",
        output_text: JSON.stringify({
          interpretation: { kind: "conversation" },
        }),
      }),
    );
    const interpreter = createInterpreter({ fetch });

    await interpretOnce(interpreter, "Would a coat be sensible now?", {
      ...context,
      resultReferences: [
        {
          facts: {
            countryCode: "GB",
            name: "Eastbourne",
            timezone: "Europe/London",
          },
          kind: "weather_location",
          ordinal: 1,
          reference: "weather-location-1",
        },
      ],
    });

    const input = JSON.stringify(readRequestBody(fetch).input);
    expect(input).toContain("Eastbourne");
    expect(input).toContain("omit location to continue");
    expect(input).not.toContain("50.768");
  });

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
    expect(body.reasoning).toEqual({ effort: "none" });
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
    expect(JSON.stringify(body.input)).toContain(
      "Calendar list requests use a short default window",
    );
    expect(JSON.stringify(body.input)).toContain(
      "supply all applicable exact bounds",
    );
    expect(JSON.stringify(body.input)).toContain(
      "both startDate and endDate for a bounded month or period",
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
          clarificationCommand: { $ref: "#/$defs/command" },
          clarificationParameter: { type: "string" },
          kind: { enum: ["clarification"], type: "string" },
          response: { $ref: "#/$defs/response" },
        },
        required: [
          "kind",
          "clarificationCapability",
          "clarificationCommand",
          "clarificationParameter",
          "response",
        ],
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
            clarificationCommand: {
              capability: "internet.search",
              parameters: [],
              rawText: "Can you search?",
            },
            clarificationParameter: "query",
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

    const body = readRequestBody(fetch);
    const input = JSON.stringify(body.input);
    expect(input).toContain(
      "When a capability matches but required information is missing",
    );
    expect(input).toContain(
      "Never fill a required parameter with words that merely restate the capability request",
    );
    expect(input).toContain(
      "Capability confirmation policy is application-owned",
    );
    expect(input).toContain(
      "Parameter object names must be exact declared parameter identifiers",
    );
    expect(input).toContain("For a declared parameter literally named name");
    expect(input).toContain(
      "When calling a read tool, emit only that function call",
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

  it("gives the model a general narrow-profile resolution policy", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-profile-policy",
        output_text: JSON.stringify({
          interpretation: { kind: "conversation" },
        }),
      }),
    );
    const interpreter = createInterpreter({
      capabilityCatalog: [internetSearchCapability, profileLookupCapability],
      fetch,
    });

    await interpretOnce(interpreter, "Help with something personal", context);

    const body = readRequestBody(fetch);
    const input = JSON.stringify(body.input);
    expect(input).toContain(
      "When resolving any request whose meaning depends on a personal detail about the user",
    );
    expect(input).toContain(
      "call the narrow profile lookup read tool for exactly the field needed",
    );
    expect(input).toContain(
      "The application will save an explicitly supplied missing value before resuming the original capability",
    );
    expect(input).not.toContain("weather at home");
    expect(input).not.toContain("search for myself");
    expect(body.text.format.schema).toMatchObject({
      $defs: {
        command: {
          properties: { capability: { enum: ["internet.search"] } },
        },
      },
    });
    expect(body.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: expect.stringContaining(
            "Read one explicitly stored personal profile fact",
          ) as string,
          parameters: expect.objectContaining({
            properties: {
              field: expect.objectContaining({
                enum: ["name", "homeLocation"],
              }) as unknown,
            },
          }) as unknown,
        }),
      ]),
    );
  });
});
