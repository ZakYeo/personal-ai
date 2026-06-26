import {
  defaultDeterministicConfig,
  deterministicNow,
  deterministicNowIso,
  disabledCalendarConfig,
  enabledDeterministicConfig,
  runtimeFailureConfig,
  runtimeFailureDiagnostic,
  runtimeFailureResponse,
} from "./deterministic-runtime-fixtures.js";

describe("deterministic runtime fixtures", () => {
  it("names reusable fixed time and config shapes", () => {
    expect(deterministicNowIso).toBe("2026-06-26T09:00:00.000Z");
    expect(deterministicNow.toISOString()).toBe(deterministicNowIso);
    expect(enabledDeterministicConfig.features).toEqual({
      calendar: { enabled: true, adapter: "mock" },
      messaging: { enabled: true, adapter: "mock" },
      alarms: { enabled: true, adapter: "local" },
    });
    expect(defaultDeterministicConfig.features.alarms).toEqual({
      enabled: true,
      adapter: "local",
      confirmationRequiredCapabilities: ["alarm.create"],
    });
    expect(disabledCalendarConfig.features.calendar).toEqual({
      enabled: false,
    });
  });

  it("names reusable runtime failure fixtures", () => {
    expect(runtimeFailureConfig.assistant.name).toBe("");
    expect(runtimeFailureResponse.status).toBe("error");
    expect(runtimeFailureDiagnostic).toBe(
      "Runtime failure: Config assistant.name must be a non-empty string.",
    );
  });
});
