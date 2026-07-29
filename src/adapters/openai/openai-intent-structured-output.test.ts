import type { AssistantContext } from "../../ports/assistant.js";
import { interpretOnce } from "../../ports/intent.js";
import {
  createFetchStub,
  createProviderCredentialEnv,
  jsonResponse,
} from "../../test-support/adapter-contract.js";
import { deterministicTestNow } from "../../test-support/primitives.js";
import { OpenAIIntentInterpreter } from "./openai-intent-interpreter.js";
import type { OpenAIIntentCapability } from "./openai-intent-interpreter.js";

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
    features: {
      calendar: { enabled: true },
    },
  },
} satisfies AssistantContext;

describe("OpenAIIntentInterpreter", () => {
  it("returns a bounded compound plan from structured provider output", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: JSON.stringify({
          command: null,
          kind: "plan",
          plan: {
            commands: [
              {
                capability: "calendar.search_events",
                parameters: [],
                rawText: "check my calendar and set an alarm",
              },
              {
                capability: "alarm.create",
                parameters: [{ name: "minutesFromNow", value: 10 }],
                rawText: "check my calendar and set an alarm",
              },
            ],
          },
          response: null,
        }),
      }),
    );
    const interpreter = createInterpreter({ fetch });

    await expect(
      interpretOnce(interpreter, "check my calendar and set an alarm", context),
    ).resolves.toEqual({
      kind: "plan",
      plan: {
        commands: [
          {
            capability: "calendar.search_events",
            parameters: {},
            rawText: "check my calendar and set an alarm",
          },
          {
            capability: "alarm.create",
            parameters: { minutesFromNow: 10 },
            rawText: "check my calendar and set an alarm",
          },
        ],
      },
    });
  });

  it("rejects plans containing more than three commands", async () => {
    const command = {
      capability: "alarm.list",
      parameters: [],
      rawText: "do four things",
    };
    const interpreter = createInterpreter({
      fetch: createFetchStub(
        jsonResponse({
          id: "response-1",
          output_text: JSON.stringify({
            command: null,
            kind: "plan",
            plan: { commands: [command, command, command, command] },
            response: null,
          }),
        }),
      ),
    });

    await expect(
      interpretOnce(interpreter, "do four things", context),
    ).rejects.toThrow(
      "OpenAI intent response plan.commands must contain one to three commands.",
    );
  });

  it("rejects a command branch with a populated plan", async () => {
    const interpreter = createInterpreter({
      fetch: createFetchStub(
        jsonResponse({
          id: "response-1",
          output_text: JSON.stringify({
            command: {
              capability: "alarm.list",
              parameters: [],
              rawText: "list alarms",
            },
            kind: "command",
            plan: { commands: [] },
            response: null,
          }),
        }),
      ),
    });

    await expect(
      interpretOnce(interpreter, "list alarms", context),
    ).rejects.toThrow("OpenAI intent command response must set plan to null.");
  });

  it("rejects conversation output with fallback response text", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: JSON.stringify({
          kind: "conversation",
          command: null,
          plan: null,
          response: {
            status: "ok",
            text: "I am doing well.",
          },
        }),
      }),
    );
    const interpreter = createInterpreter({ fetch });

    await expect(
      interpretOnce(interpreter, "Hey Jarvis, how are you today?", context),
    ).rejects.toThrow(
      "OpenAI intent conversation response must set command, plan, and response to null.",
    );
  });

  it("returns an unsupported response from structured provider output", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: JSON.stringify({
          kind: "unsupported",
          command: null,
          plan: null,
          response: {
            status: "unsupported",
            text: "I cannot do that.",
          },
        }),
      }),
    );
    const interpreter = createInterpreter({ fetch });

    await expect(
      interpretOnce(interpreter, "Hey Jarvis, send money", context),
    ).resolves.toEqual({
      kind: "unsupported",
      response: {
        status: "unsupported",
        text: "I cannot do that.",
      },
    });
  });

  it.each([
    ["clarification", "See https://example.com for choices."],
    ["unknown", "See www.example.com for details."],
    ["unsupported", "Read [the source](https://example.com)."],
    ["clarification", "Choose the source marked [1]."],
  ])("rejects %s response text unsuitable for speech", async (kind, text) => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: JSON.stringify({
          command: null,
          kind,
          plan: null,
          response: { status: "unknown", text },
        }),
      }),
    );
    const interpreter = createInterpreter({ fetch });

    await expect(
      interpretOnce(interpreter, "Can you help?", context),
    ).rejects.toThrow(
      "OpenAI intent response text must be suitable for spoken delivery.",
    );
  });

  it("extracts text from Responses API output content", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output: [
          {
            content: [
              {
                text: JSON.stringify({
                  kind: "command",
                  plan: null,
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
      interpretOnce(interpreter, "Hey Jarvis, list my alarms", context),
    ).resolves.toEqual({
      command: {
        capability: "alarm.list",
        parameters: {},
        rawText: "Hey Jarvis, list my alarms",
      },
      kind: "command",
    });
  });
});

interface CreateInterpreterOptions {
  capabilityCatalog?: readonly OpenAIIntentCapability[];
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
