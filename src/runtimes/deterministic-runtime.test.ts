import { deterministicScenarios } from "../test-support/deterministic-scenarios.js";
import { disabledCalendarConfig } from "../test-support/deterministic-runtime-fixtures.js";
import {
  createDeterministicRuntimeHarness,
  createRuntimeConfigWithMissingFeatureAdapter,
  createRuntimeConfigWithUnknownFeatureAdapter,
  createRuntimeConfigWithUnknownIntentProvider,
} from "../test-support/runtime-composition.js";

describe("createDeterministicRuntime", () => {
  it("wires enabled features into the assistant", async () => {
    const assistant = await createDeterministicRuntimeHarness();

    await expect(
      assistant.handleText(deterministicScenarios.calendarWedding.text),
    ).resolves.toEqual(deterministicScenarios.calendarWedding.response);
  });

  it("respects disabled features from config", async () => {
    const assistant = await createDeterministicRuntimeHarness({
      config: disabledCalendarConfig,
    });

    await expect(
      assistant.handleText(deterministicScenarios.unsupportedCalendar.text),
    ).resolves.toEqual(deterministicScenarios.unsupportedCalendar.response);
  });

  it("requires confirmation for high-risk alarm creation", async () => {
    const assistant = await createDeterministicRuntimeHarness();

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
    const assistant = await createDeterministicRuntimeHarness({
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
      createDeterministicRuntimeHarness({
        config: createRuntimeConfigWithUnknownIntentProvider(),
      }),
    ).rejects.toThrow('Config intent.provider "unknown" is not registered.');
  });

  it("rejects enabled features without registered adapters", async () => {
    await expect(
      createDeterministicRuntimeHarness({
        config: createRuntimeConfigWithUnknownFeatureAdapter(),
      }),
    ).rejects.toThrow(
      'Config feature "calendar" adapter "unknown" is not registered.',
    );
  });

  it("rejects enabled features without adapter IDs", async () => {
    await expect(
      createDeterministicRuntimeHarness({
        config: createRuntimeConfigWithMissingFeatureAdapter(),
      }),
    ).rejects.toThrow(
      'Config feature "calendar".adapter must be set for enabled features.',
    );
  });
});
