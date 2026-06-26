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
});
