import {
  createConfiguredTextRuntimeHarness,
  createRuntimeConfigWithMissingFeatureAdapter,
  createRuntimeConfigWithUnknownFeatureAdapter,
  createRuntimeConfigWithUnknownIntentProvider,
  withFeatureAdapterId,
  withIntentProvider,
  withoutFeatureAdapterId,
  withoutVoiceConfigKey,
  writeRuntimeHarnessConfig,
  withVoiceAdapterId,
} from "./runtime-composition.js";
import { deterministicScenarios } from "./deterministic-scenarios.js";
import {
  deterministicNow,
  disabledCalendarConfig,
  enabledDeterministicConfig,
  mockVoiceConfig,
} from "./deterministic-runtime-fixtures.js";

describe("runtime composition test support", () => {
  it("creates configured text runtimes with a fixed clock by default", async () => {
    const assistant = await createConfiguredTextRuntimeHarness();

    await expect(
      assistant.handleText(deterministicScenarios.calendarWedding.text),
    ).resolves.toEqual(deterministicScenarios.calendarWedding.response);
  });

  it("overrides config and config path one input at a time", async () => {
    const disabledFeatureRuntime = await createConfiguredTextRuntimeHarness({
      config: disabledCalendarConfig,
    });
    const configPath = await writeRuntimeHarnessConfig(
      enabledDeterministicConfig,
    );
    const configPathRuntime = await createConfiguredTextRuntimeHarness({
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

  it("creates one-change runtime config variants", () => {
    expect(withIntentProvider("unknown")).toMatchObject({
      intent: { provider: "unknown" },
    });
    expect(withFeatureAdapterId("calendar", "unknown")).toMatchObject({
      features: { calendar: { enabled: true, adapter: "unknown" } },
    });
    expect(withoutFeatureAdapterId("calendar")).toMatchObject({
      features: { calendar: { enabled: true } },
    });
    expect(
      withVoiceAdapterId("speechToText", "unknown", {
        ...enabledDeterministicConfig,
        voice: mockVoiceConfig,
      }),
    ).toMatchObject({ voice: { speechToText: "unknown" } });
    expect(
      withoutVoiceConfigKey("speechToText", {
        ...enabledDeterministicConfig,
        voice: mockVoiceConfig,
      }),
    ).toMatchObject({ voice: { input: "mock", wakeWord: "mock" } });
  });

  it("allows explicit clock overrides", async () => {
    const now = new Date(deterministicNow.getTime() + 60_000);
    const assistant = await createConfiguredTextRuntimeHarness({ now });

    await expect(
      assistant.handleText(
        deterministicScenarios.alarmCreateNeedsConfirmation.text,
      ),
    ).resolves.toEqual(
      deterministicScenarios.alarmCreateNeedsConfirmation.response,
    );
  });
});
