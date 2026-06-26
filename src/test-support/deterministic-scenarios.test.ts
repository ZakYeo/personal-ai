import { deterministicScenarios } from "./deterministic-scenarios.js";

describe("deterministic scenario fixtures", () => {
  it("names existing deterministic command scenarios", () => {
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
  });
});
