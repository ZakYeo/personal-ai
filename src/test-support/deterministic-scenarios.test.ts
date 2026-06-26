import {
  defaultDeterministicConfig,
  deterministicNow,
  deterministicNowIso,
  deterministicScenarios,
  disabledCalendarConfig,
  enabledDeterministicConfig,
  runtimeFailureConfig,
  runtimeFailureDiagnostic,
  runtimeFailureResponse,
} from "./deterministic-scenarios.js";

describe("deterministic scenario fixtures", () => {
  it("names reusable fixed time and config shapes", () => {
    expect(deterministicNowIso).toBe("2026-06-26T09:00:00.000Z");
    expect(deterministicNow.toISOString()).toBe(deterministicNowIso);
    expect(enabledDeterministicConfig.features).toEqual({
      calendar: { enabled: true },
      messaging: { enabled: true },
      alarms: { enabled: true },
    });
    expect(defaultDeterministicConfig.features.alarms).toEqual({
      enabled: true,
      confirmationRequiredCapabilities: ["alarm.create"],
    });
    expect(disabledCalendarConfig.features.calendar).toEqual({
      enabled: false,
    });
  });

  it("names existing deterministic command and failure scenarios", () => {
    expect(deterministicScenarios.calendarWedding.text).toContain(
      "upcoming wedding",
    );
    expect(
      deterministicScenarios.messagingWhatsappDraft.response.text,
    ).toContain("Drafted a whatsapp reply");
    expect(
      deterministicScenarios.alarmCreateNeedsConfirmation.response.status,
    ).toBe("needs_confirmation");
    expect(deterministicScenarios.unknown.response.status).toBe("unknown");
    expect(runtimeFailureConfig.assistant.name).toBe("");
    expect(runtimeFailureResponse.status).toBe("error");
    expect(runtimeFailureDiagnostic).toBe(
      "Runtime failure: Config assistant.name must be a non-empty string.",
    );
  });
});
