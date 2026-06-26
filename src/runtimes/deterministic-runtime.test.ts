import { createDeterministicRuntime } from "./deterministic-runtime.js";
import {
  deterministicNow,
  deterministicScenarios,
  disabledCalendarConfig,
  enabledDeterministicConfig,
} from "../test-support/deterministic-scenarios.js";

describe("createDeterministicRuntime", () => {
  it("wires enabled features into the assistant", async () => {
    const assistant = await createDeterministicRuntime({
      config: enabledDeterministicConfig,
      now: deterministicNow,
    });

    await expect(
      assistant.handleText(deterministicScenarios.calendarWedding.text),
    ).resolves.toEqual(deterministicScenarios.calendarWedding.response);
  });

  it("respects disabled features from config", async () => {
    const assistant = await createDeterministicRuntime({
      config: disabledCalendarConfig,
    });

    await expect(
      assistant.handleText(deterministicScenarios.unsupportedCalendar.text),
    ).resolves.toEqual(deterministicScenarios.unsupportedCalendar.response);
  });

  it("keeps alarm state within one composed runtime", async () => {
    const assistant = await createDeterministicRuntime({
      config: enabledDeterministicConfig,
      now: deterministicNow,
    });

    await assistant.handleText(
      deterministicScenarios.alarmCreateWithoutConfirmation.text,
    );

    await expect(
      assistant.handleText(deterministicScenarios.alarmListWithOne.text),
    ).resolves.toEqual(deterministicScenarios.alarmListWithOne.response);
  });

  it("requires confirmation for alarm creation in the default config", async () => {
    const assistant = await createDeterministicRuntime({
      now: deterministicNow,
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
      createDeterministicRuntime({
        config: {
          ...enabledDeterministicConfig,
          intent: { provider: "unknown" },
        },
      }),
    ).rejects.toThrow('Config intent.provider "unknown" is not registered.');
  });

  it("rejects enabled features without registered adapters", async () => {
    await expect(
      createDeterministicRuntime({
        config: {
          ...enabledDeterministicConfig,
          features: {
            ...enabledDeterministicConfig.features,
            calendar: { enabled: true, adapter: "unknown" },
          },
        },
      }),
    ).rejects.toThrow(
      'Config feature "calendar" adapter "unknown" is not registered.',
    );
  });

  it("rejects enabled features without adapter IDs", async () => {
    await expect(
      createDeterministicRuntime({
        config: {
          ...enabledDeterministicConfig,
          features: {
            ...enabledDeterministicConfig.features,
            calendar: { enabled: true },
          },
        },
      }),
    ).rejects.toThrow(
      'Config feature "calendar".adapter must be set for enabled features.',
    );
  });
});
