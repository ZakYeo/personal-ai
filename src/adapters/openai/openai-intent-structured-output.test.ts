import { interpretOnce } from "../../ports/intent.js";
import {
  createFetchStub,
  jsonResponse,
} from "../../test-support/adapter-contract.js";
import {
  createOpenAIIntentInterpreter as createInterpreter,
  openAIIntentOutput,
  openAIIntentContext as context,
} from "../../test-support/openai-intent.js";

describe("OpenAIIntentInterpreter", () => {
  it("returns a bounded compound plan from structured provider output", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: openAIIntentOutput({
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
          output_text: openAIIntentOutput({
            kind: "plan",
            plan: { commands: [command, command, command, command] },
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
          output_text: openAIIntentOutput({
            command: {
              capability: "alarm.list",
              parameters: [],
              rawText: "list alarms",
            },
            kind: "command",
            plan: { commands: [] },
          }),
        }),
      ),
    });

    await expect(
      interpretOnce(interpreter, "list alarms", context),
    ).rejects.toThrow(
      "OpenAI intent command response fields must be command, kind.",
    );
  });

  it("rejects conversation output with fallback response text", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: openAIIntentOutput({
          kind: "conversation",
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
      "OpenAI intent conversation response fields must be kind.",
    );
  });

  it("returns an unsupported response from structured provider output", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: openAIIntentOutput({
          kind: "unsupported",
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
    ["unknown", "Observed at 2026-08-04T15:00:00.000Z."],
    ["unsupported", "Scheduled in Europe/London."],
  ])("rejects %s response text unsuitable for speech", async (kind, text) => {
    const fetch = createFetchStub(
      jsonResponse({
        id: "response-1",
        output_text: openAIIntentOutput({
          ...(kind === "clarification"
            ? { clarificationCapability: "test.choose" }
            : {}),
          kind,
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
                text: openAIIntentOutput({
                  kind: "command",
                  command: {
                    capability: "alarm.list",
                    parameters: [],
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
