import {
  jsonResponse,
  readJsonRequestBody,
} from "../test-support/adapter-contract.js";
import { deterministicScenarios } from "../test-support/deterministic-scenarios.js";
import {
  createConfiguredTextRuntimeHarness,
  createRuntimeConfigWithOpenAIIntentProvider,
} from "../test-support/runtime-composition.js";

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

function intentResponse(id: string, output: Record<string, unknown>) {
  return jsonResponse({
    id: `intent-${id}`,
    output_text: JSON.stringify(output),
  });
}
