import {
  createDeterministicRuntimeHarness,
  createRuntimeConfigWithMissingFeatureAdapter,
  createRuntimeConfigWithUnknownFeatureAdapter,
  createRuntimeConfigWithUnknownIntentProvider,
  writeRuntimeHarnessConfig,
} from "./runtime-composition.js";
import { deterministicScenarios } from "./deterministic-scenarios.js";
import {
  deterministicNow,
  disabledCalendarConfig,
  enabledDeterministicConfig,
} from "./deterministic-runtime-fixtures.js";

describe("runtime composition test support", () => {
  it("creates deterministic runtimes with a fixed clock by default", async () => {
    const assistant = await createDeterministicRuntimeHarness();

    await expect(
      assistant.handleText(deterministicScenarios.calendarWedding.text),
    ).resolves.toEqual(deterministicScenarios.calendarWedding.response);
  });

  it("overrides config and config path one input at a time", async () => {
    const disabledFeatureRuntime = await createDeterministicRuntimeHarness({
      config: disabledCalendarConfig,
    });
    const configPath = await writeRuntimeHarnessConfig(
      enabledDeterministicConfig,
    );
    const configPathRuntime = await createDeterministicRuntimeHarness({
      configPath,
    });

    await expect(
      disabledFeatureRuntime.handleText(
        deterministicScenarios.unsupportedCalendar.text,
      ),
    ).resolves.toEqual(deterministicScenarios.unsupportedCalendar.response);
    await expect(
      configPathRuntime.handleText(deterministicScenarios.calendarWedding.text),
    ).resolves.toEqual(deterministicScenarios.calendarWedding.response);
  });

  it("creates focused invalid composition configs", () => {
    expect(createRuntimeConfigWithUnknownIntentProvider()).toMatchObject({
      intent: { provider: "unknown" },
    });
    expect(createRuntimeConfigWithUnknownFeatureAdapter()).toMatchObject({
      features: { calendar: { enabled: true, adapter: "unknown" } },
    });
    expect(createRuntimeConfigWithMissingFeatureAdapter()).toMatchObject({
      features: { calendar: { enabled: true } },
    });
  });

  it("allows explicit clock overrides", async () => {
    const now = new Date(deterministicNow.getTime() + 60_000);
    const assistant = await createDeterministicRuntimeHarness({ now });

    await expect(
      assistant.handleText(
        deterministicScenarios.alarmCreateNeedsConfirmation.text,
      ),
    ).resolves.toEqual(
      deterministicScenarios.alarmCreateNeedsConfirmation.response,
    );
  });
});
