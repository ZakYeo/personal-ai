import {
  jsonResponse,
  readJsonRequestBody,
} from "../test-support/adapter-contract.js";
import { deterministicScenarios } from "../test-support/deterministic-scenarios.js";
import {
  createConfiguredTextRuntimeHarness,
  createRuntimeConfigWithOpenAIIntentProvider,
} from "../test-support/runtime-composition.js";
import { createOpenAIIntentInterpreter } from "../test-support/openai-intent.js";
import { createAssistant as createCoreAssistant } from "../core/assistant/assistant.js";
import { createCapabilityRoutingIndex } from "../ports/capability-catalog.js";
import {
  createAssistantConfig,
  createFixedClock,
  createRawFeature,
} from "../test-support/core-assistant.js";

describe("configured clarification transitions", () => {
  it("starts fresh after an OpenAI rephrase prompt", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        intentResponse("rephrase", {
          command: null,
          kind: "rephrase",
          plan: null,
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
          command: null,
          kind: "clarification",
          plan: null,
          response: { status: "ok", text: "What time?" },
        }),
      )
      .mockResolvedValueOnce(
        intentResponse("replacement", {
          command: null,
          kind: "replacement",
          plan: null,
          response: null,
        }),
      )
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
          plan: null,
          response: null,
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
          command: null,
          kind: "replacement",
          plan: null,
          response: null,
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
          plan: null,
          response: null,
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
    plan: null,
    response: null,
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
    plan: null,
    response: null,
  });
}

function intentResponse(id: string, output: Record<string, unknown>) {
  return jsonResponse({
    id: `intent-${id}`,
    output_text: JSON.stringify(output),
  });
}
