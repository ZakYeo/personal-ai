import { createHumanizedNotificationDelivery } from "./humanized-notification-delivery.js";

describe("createHumanizedNotificationDelivery", () => {
  it("uses a notification's subject timezone and removes policy metadata", async () => {
    const deliver = vi.fn(() => Promise.resolve());
    const delivery = createHumanizedNotificationDelivery(
      { deliver },
      {
        now: () => new Date("2026-09-04T23:30:00.000Z"),
        timeZone: "America/New_York",
      },
    );

    await delivery.deliver(
      {
        id: "briefing-one",
        spokenText: { dateStyle: "contextual", timeZone: "Europe/London" },
        text: "Briefing event at 2026-09-05T00:15:00.000Z.",
      },
      {},
    );

    expect(deliver).toHaveBeenCalledWith(
      {
        id: "briefing-one",
        text: "Briefing event at 1:15am today, London time.",
      },
      {},
    );
  });
});
