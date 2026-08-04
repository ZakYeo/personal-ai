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
  it("returns a command from structured provider output", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: JSON.stringify({
          kind: "command",
          plan: null,
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

    expect(body.text.format.schema).toMatchObject({
      additionalProperties: false,
      properties: {
        command: {
          type: ["object", "null"],
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
        kind: {
          enum: [
            "command",
            "plan",
            "conversation",
            "clarification",
            "rephrase",
            "replacement",
            "unknown",
            "unsupported",
          ],
        },
        plan: {
          type: ["object", "null"],
          properties: {
            commands: { type: "array", minItems: 1, maxItems: 3 },
          },
        },
        response: {
          type: ["object", "null"],
          required: ["status", "text"],
        },
      },
      required: ["kind", "command", "plan", "response"],
    });
    expect(body.text.format.schema).not.toHaveProperty("anyOf");
    expect(JSON.stringify(body.input)).toContain("calendar.search_events");
    expect(JSON.stringify(body.input)).toContain("query: string (optional)");
    expect(JSON.stringify(body.input)).toContain(
      "Questions about the assistant's enabled capabilities must use the enabled assistant capability that lists them when one is present.",
    );
    expect(JSON.stringify(body.input)).toContain(
      "When kind is command, command must be populated",
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

  it("returns a conversation classification from structured provider output", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: JSON.stringify({
          kind: "conversation",
          command: null,
          plan: null,
          response: null,
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
          command: null,
          kind: "rephrase",
          plan: null,
          response: {
            status: "ok",
            text: "What would you like me to do?",
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
      "Use kind rephrase when the request is too incomplete to select a specific workflow",
    );
  });

  it.each(["unknown", "unsupported"] as const)(
    "fails closed by ignoring an inactive command on a %s response",
    async (kind) => {
      const fetch = createFetchStub(
        jsonResponse({
          id: "response-1",
          output_text: JSON.stringify({
            command: {
              capability: "internet.search",
              parameters: [{ name: "query", value: "can you search" }],
              rawText: "Can you search the web for me?",
            },
            kind,
            plan: null,
            response: {
              status: kind,
              text: "What would you like me to search for?",
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
      ).resolves.toEqual({
        kind,
        response: {
          status: kind,
          text: "What would you like me to search for?",
        },
      });
    },
  );

  it("instructs the provider to clarify capability requests missing required user information", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: JSON.stringify({
          command: null,
          kind: "clarification",
          plan: null,
          response: {
            status: "ok",
            text: "What would you like me to search for?",
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
      "Choose by the requested object or domain, not by a generic verb",
    );
  });
});
