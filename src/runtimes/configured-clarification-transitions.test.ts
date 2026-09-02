import {
  jsonResponse,
  readJsonRequestBody,
} from "../test-support/adapter-contract.js";
import { deterministicScenarios } from "../test-support/deterministic-scenarios.js";
import {
  createConfiguredTextRuntimeHarness,
  createRuntimeConfigWithOpenAIIntentProvider,
} from "../test-support/runtime-composition.js";
import {
  createOpenAIIntentInterpreter,
  openAIIntentOutput,
} from "../test-support/openai-intent.js";
import { DeterministicIntentInterpreter } from "../adapters/mock/deterministic-intent-interpreter.js";
import { createAssistant as createCoreAssistant } from "../core/assistant/assistant.js";
import { createCapabilityRoutingIndex } from "../application/capability-catalog.js";
import {
  createAssistantConfig,
  createFeature,
  createFixedClock,
  createRawFeature,
} from "../test-support/core-assistant.js";

describe("configured clarification transitions", () => {
  it("resumes a feature clarification with the deterministic intent adapter", async () => {
    const feature = createFeature({
      id: "weather",
      capability: {
        name: "weather.current",
        parameters: { location: { required: true, type: "string" } },
        risk: "low",
      },
      execute: (request) =>
        Promise.resolve(
          request.args.location === "london"
            ? {
                kind: "resumable_clarification" as const,
                parameter: "location",
                text: "Which London did you mean?",
              }
            : { text: `Weather for ${request.args.location}.` },
        ),
    });
    const assistant = createCoreAssistant({
      capabilityRouting: createCapabilityRoutingIndex([feature]),
      clock: createFixedClock(),
      config: createAssistantConfig({ weather: { enabled: true } }),
      intentInterpreter: new DeterministicIntentInterpreter([
        {
          capability: "weather.current",
          match: (text) => {
            const match = /^weather in (.+)$/u.exec(text);
            return match?.[1] ? { location: match[1] } : undefined;
          },
        },
      ]),
    });

    await expect(assistant.handleText("Weather in London")).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "Which London did you mean?",
    });
    await expect(
      assistant.handleText("London, United Kingdom"),
    ).resolves.toEqual({
      status: "ok",
      text: "Weather for London, United Kingdom.",
    });
  });

  it("starts fresh after an OpenAI rephrase prompt", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        intentResponse("rephrase", {
          kind: "rephrase",
          response: { status: "ok", text: "What would you like me to do?" },
        }),
      )
      .mockResolvedValueOnce(capabilityListResponse("capabilities"));
    const assistant = await createAssistant(fetch);

    await expect(assistant.handleText("Can you do")).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "What would you like me to do?",
    });
    await expect(
      assistant.handleText("What are your capabilities?"),
    ).resolves.toEqual(deterministicScenarios.capabilityList.response);

    expect(
      readJsonRequestBody<Record<string, unknown>>(fetch, 1),
    ).not.toHaveProperty("previous_response_id");
  });

  it("starts fresh when an OpenAI clarification reply changes topic", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        intentResponse("clarification", {
          clarificationCapability: "alarm.create",
          clarificationCommand: {
            capability: "alarm.create",
            parameters: [],
            rawText: "Set an alarm",
          },
          clarificationParameter: "minutesFromNow",
          kind: "clarification",
          response: { status: "ok", text: "What time?" },
        }),
      )
      .mockResolvedValueOnce(capabilityListResponse("direct-new-topic"))
      .mockResolvedValueOnce(capabilityListResponse("capabilities"));
    const assistant = await createAssistant(fetch);

    await expect(assistant.handleText("Set an alarm")).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "What time?",
    });
    await expect(
      assistant.handleText("What are your capabilities?"),
    ).resolves.toEqual(deterministicScenarios.capabilityList.response);

    expect(
      readJsonRequestBody<Record<string, unknown>>(fetch, 1),
    ).toMatchObject({ previous_response_id: "intent-clarification" });
    expect(
      readJsonRequestBody<Record<string, unknown>>(fetch, 2),
    ).not.toHaveProperty("previous_response_id");
  });

  it("restarts safely when semantic validation clarifies a tool call", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          id: "intent-unsafe-tool",
          output: [
            {
              arguments: '{"subject":"Can you inspect this"}',
              call_id: "unsafe-read",
              name: "read_0",
              type: "function_call",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        intentResponse("resolved", {
          command: {
            capability: "test.inspect",
            parameters: [{ name: "subject", value: "the weather" }],
            rawText: "the weather",
          },
          kind: "command",
        }),
      );
    const assistant = createCoreAssistant({
      capabilityRouting: createCapabilityRoutingIndex([
        createRawFeature({
          capabilities: [
            {
              name: "test.inspect",
              parameters: {
                subject: { required: true, type: "string" },
              },
              risk: "low",
              toolChain: "read",
            },
          ],
          execute: (request) =>
            Promise.resolve({ text: `Inspected ${request.args.subject}.` }),
          id: "test",
        }),
      ]),
      clock: createFixedClock(),
      config: createAssistantConfig({ test: { enabled: true } }),
      intentInterpreter: createOpenAIIntentInterpreter({
        capabilityCatalog: [
          {
            capability: {
              name: "test.inspect",
              parameters: {
                subject: { required: true, type: "string" },
              },
              risk: "low",
              toolChain: "read",
            },
            featureId: "test",
            featureName: "Test",
            parameterText: "subject: string (required)",
          },
        ],
        fetch,
      }),
    });

    await expect(assistant.handleText("Can you inspect this")).resolves.toEqual(
      {
        expectsFollowUp: true,
        status: "ok",
        text: "What details should I use for this request?",
      },
    );
    await expect(assistant.handleText("the weather")).resolves.toEqual({
      status: "ok",
      text: "Inspected the weather.",
    });

    const restarted = readJsonRequestBody<Record<string, unknown>>(fetch, 1);
    expect(restarted).not.toHaveProperty("previous_response_id");
    expect(JSON.stringify(restarted.input)).toContain("Can you inspect this");
    expect(JSON.stringify(restarted.input)).toContain("the weather");
    expect(JSON.stringify(restarted.input)).toContain(
      "What details should I use for this request?",
    );
  });

  it("resumes with safe context after feature validation clarifies a command", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(choiceResponse("ambiguous", "something"))
      .mockResolvedValueOnce(choiceResponse("resolved", "the first option"));
    const assistant = createChoiceAssistant(fetch);

    await expect(assistant.handleText("Choose something")).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "Which exact option should I choose?",
    });
    await expect(assistant.handleText("the first option")).resolves.toEqual({
      status: "ok",
      text: "Chose the first option.",
    });

    const continuation = readJsonRequestBody<Record<string, unknown>>(fetch, 1);
    expect(continuation).toMatchObject({
      previous_response_id: "intent-ambiguous",
    });
    expect(String(continuation.instructions)).toContain(
      "Which exact option should I choose?",
    );
    expect(String(continuation.instructions)).toContain(
      '"origin":"feature_validation"',
    );
    expect(String(continuation.instructions)).toContain(
      '"capability":"test.choose"',
    );
  });

  it("starts fresh when a feature clarification reply replaces the request", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(choiceResponse("ambiguous", "something"))
      .mockResolvedValueOnce(
        intentResponse("replacement", {
          kind: "replacement",
        }),
      )
      .mockResolvedValueOnce(
        intentResponse("new-request", {
          command: {
            capability: "test.choose",
            parameters: [{ name: "choice", value: "a different option" }],
            rawText: "Choose a different option",
          },
          kind: "command",
        }),
      );
    const assistant = createChoiceAssistant(fetch);

    await assistant.handleText("Choose something");
    await expect(
      assistant.handleText("Choose a different option"),
    ).resolves.toEqual({
      status: "ok",
      text: "Chose a different option.",
    });

    expect(
      readJsonRequestBody<Record<string, unknown>>(fetch, 1),
    ).toMatchObject({ previous_response_id: "intent-ambiguous" });
    expect(
      readJsonRequestBody<Record<string, unknown>>(fetch, 2),
    ).not.toHaveProperty("previous_response_id");
  });
});

function createAssistant(fetch: typeof globalThis.fetch) {
  return createConfiguredTextRuntimeHarness({
    config: createRuntimeConfigWithOpenAIIntentProvider(),
    env: { OPENAI_API_KEY: "test-api-key" },
    fetch,
  });
}

function capabilityListResponse(id: string) {
  return intentResponse(id, {
    command: {
      capability: "assistant.capabilities.list",
      parameters: [],
      rawText: "What are your capabilities?",
    },
    kind: "command",
  });
}

function createChoiceAssistant(fetch: typeof globalThis.fetch) {
  const capability = {
    name: "test.choose",
    parameters: {
      choice: { required: true as const, type: "string" as const },
    },
    requestClarification: (args: Record<string, unknown>) =>
      args.choice === "something"
        ? { status: "ok" as const, text: "Which exact option should I choose?" }
        : undefined,
    risk: "low" as const,
  };
  return createCoreAssistant({
    capabilityRouting: createCapabilityRoutingIndex([
      createRawFeature({
        capabilities: [capability],
        execute: (request) =>
          Promise.resolve({ text: `Chose ${request.args.choice}.` }),
        id: "test",
      }),
    ]),
    clock: createFixedClock(),
    config: createAssistantConfig({ test: { enabled: true } }),
    intentInterpreter: createOpenAIIntentInterpreter({
      capabilityCatalog: [
        {
          capability,
          featureId: "test",
          featureName: "Test",
          parameterText: "choice: string (required)",
        },
      ],
      fetch,
    }),
  });
}

function choiceResponse(id: string, choice: string) {
  return intentResponse(id, {
    command: {
      capability: "test.choose",
      parameters: [{ name: "choice", value: choice }],
      rawText: `Choose ${choice}`,
    },
    kind: "command",
  });
}

function intentResponse(id: string, output: Record<string, unknown>) {
  return jsonResponse({
    id: `intent-${id}`,
    output_text: openAIIntentOutput(output),
  });
}
