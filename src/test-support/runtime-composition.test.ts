import {
  createConfiguredTextRuntimeHarness,
  createGoogleCalendarRuntimeConfigInput,
  createRuntimeConfigWithMissingFeatureAdapter,
  createRuntimeConfigWithUnknownFeatureAdapter,
  createRuntimeConfigWithUnknownIntentProvider,
  withIntentProvider,
  withoutVoiceConfigKey,
  writePersistentAlarmRuntimeConfig,
  writeRuntimeHarnessConfig,
  withVoiceAdapterId,
} from "./runtime-composition.js";
import { loadConfig } from "../runtimes/config/config.js";
import { deterministicScenarios } from "./deterministic-scenarios.js";
import {
  deterministicNow,
  disabledCalendarConfig,
  enabledDeterministicConfig,
  mockVoiceConfig,
} from "./deterministic-runtime-fixtures.js";
import { createFileAlarmStore } from "../adapters/local/file-alarm-store.js";
import { createScheduledAlarmRecord } from "./primitives.js";

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
    expect(() => createRuntimeConfigWithUnknownIntentProvider()).toThrow(
      'Config intent.provider "unknown" is not registered.',
    );
    expect(createRuntimeConfigWithUnknownFeatureAdapter()).toMatchObject({
      features: { calendar: { enabled: true, adapter: "unknown" } },
    });
    expect(createRuntimeConfigWithMissingFeatureAdapter()).toMatchObject({
      features: { calendar: { enabled: true } },
    });
  });

  it("round-trips Google calendar adapter selection through runtime harness files", async () => {
    const configPath = await writeRuntimeHarnessConfig(
      createGoogleCalendarRuntimeConfigInput(),
    );

    await expect(loadConfig({ configPath })).resolves.toMatchObject({
      features: {
        calendar: {
          adapter: "google",
          enabled: true,
        },
      },
    });
  });

  it("creates one-change runtime config variants", () => {
    expect(() => withIntentProvider("unknown")).toThrow(
      'Config intent.provider "unknown" is not registered.',
    );
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
    const assistant = await createConfiguredTextRuntimeHarness({
      now: () => now,
    });

    await expect(
      assistant.handleText(
        deterministicScenarios.alarmCreateNeedsConfirmation.text,
      ),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "needs_confirmation",
      text: "Please confirm: 1. set the ping me alarm for 2026-06-26T09:11:00.000Z. Say yes or no.",
    });
  });

  it("writes focused persistent alarm config and seeded state", async () => {
    const alarm = {
      id: "seeded-alarm",
      label: "tea",
      scheduledFor: "2026-07-13T17:00:00.000Z",
    };
    const { configPath, statePath } = await writePersistentAlarmRuntimeConfig(
      enabledDeterministicConfig,
      {
        alarms: [alarm],
      },
    );

    await expect(loadConfig({ configPath })).resolves.toMatchObject({
      features: {
        alarms: {
          adapter: "file",
          enabled: true,
        },
      },
    });
    await expect(
      createFileAlarmStore({
        filePath: statePath,
        now: () => new Date("2026-07-13T16:00:00.000Z"),
      }).list(),
    ).resolves.toEqual([
      createScheduledAlarmRecord({
        ...alarm,
        createdAt: alarm.scheduledFor,
        updatedAt: alarm.scheduledFor,
      }),
    ]);
  });
});
