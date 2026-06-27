import { deterministicScenarios } from "../test-support/deterministic-scenarios.js";
import { disabledCalendarConfig } from "../test-support/deterministic-runtime-fixtures.js";
import {
  createConfiguredTextRuntimeHarness,
  createRuntimeConfigWithOpenAIIntentProvider,
  createRuntimeConfigWithMissingFeatureAdapter,
  createRuntimeConfigWithUnknownFeatureAdapter,
  createRuntimeConfigWithUnknownIntentProvider,
} from "../test-support/runtime-composition.js";

describe("createConfiguredTextRuntime", () => {
  it("wires enabled features into the assistant", async () => {
    const assistant = await createConfiguredTextRuntimeHarness();

    await expect(
      assistant.handleText(deterministicScenarios.calendarWedding.text),
    ).resolves.toEqual(deterministicScenarios.calendarWedding.response);
  });

  it("respects disabled features from config", async () => {
    const assistant = await createConfiguredTextRuntimeHarness({
      config: disabledCalendarConfig,
    });

    await expect(
      assistant.handleText(deterministicScenarios.unsupportedCalendar.text),
    ).resolves.toEqual(deterministicScenarios.unsupportedCalendar.response);
  });

  it("requires confirmation for high-risk alarm creation", async () => {
    const assistant = await createConfiguredTextRuntimeHarness();

    await expect(
      assistant.handleText(
        deterministicScenarios.alarmCreateNeedsConfirmation.text,
      ),
    ).resolves.toEqual(
      deterministicScenarios.alarmCreateNeedsConfirmation.response,
    );

    await expect(
      assistant.handleText(deterministicScenarios.alarmListEmpty.text),
    ).resolves.toEqual(deterministicScenarios.alarmListEmpty.response);
  });

  it("requires confirmation for alarm creation in the default config", async () => {
    const assistant = await createConfiguredTextRuntimeHarness({
      useRuntimeDefaultConfig: true,
    });

    await expect(
      assistant.handleText(
        deterministicScenarios.alarmCreateNeedsConfirmation.text,
      ),
    ).resolves.toEqual(
      deterministicScenarios.alarmCreateNeedsConfirmation.response,
    );

    await expect(
      assistant.handleText(deterministicScenarios.alarmListEmpty.text),
    ).resolves.toEqual(deterministicScenarios.alarmListEmpty.response);
  });

  it("rejects unknown intent providers during composition", async () => {
    await expect(
      createConfiguredTextRuntimeHarness({
        config: createRuntimeConfigWithUnknownIntentProvider(),
      }),
    ).rejects.toThrow('Config intent.provider "unknown" is not registered.');
  });

  it("wires OpenAI intent providers into the assistant", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            kind: "command",
            command: {
              capability: "alarm.list",
              parameters: [],
              rawText: deterministicScenarios.alarmListEmpty.text,
            },
            response: null,
          }),
        }),
        { status: 200 },
      ),
    );
    const assistant = await createConfiguredTextRuntimeHarness({
      config: createRuntimeConfigWithOpenAIIntentProvider(),
      env: { OPENAI_API_KEY: "test-api-key" },
      fetch,
    });

    await expect(
      assistant.handleText(deterministicScenarios.alarmListEmpty.text),
    ).resolves.toEqual(deterministicScenarios.alarmListEmpty.response);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.test/v1/responses",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("rejects enabled features without registered adapters", async () => {
    await expect(
      createConfiguredTextRuntimeHarness({
        config: createRuntimeConfigWithUnknownFeatureAdapter(),
      }),
    ).rejects.toThrow(
      'Config feature "calendar" adapter "unknown" is not registered.',
    );
  });

  it("rejects enabled features without adapter IDs", async () => {
    await expect(
      createConfiguredTextRuntimeHarness({
        config: createRuntimeConfigWithMissingFeatureAdapter(),
      }),
    ).rejects.toThrow(
      'Config feature "calendar".adapter must be set for enabled features.',
    );
  });
});
