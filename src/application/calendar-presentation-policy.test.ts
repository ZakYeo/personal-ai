import { sanitizeCalendarEventTitle } from "./calendar-presentation-policy.js";

describe("calendar presentation policy", () => {
  it.each([
    [
      "💒 Guest Arrival & Welcome Drinks 하객 도착",
      "Guest Arrival & Welcome Drinks 하객 도착",
    ],
    [
      "🎉 Evening Reception / 이브닝 리셉션",
      "Evening Reception / 이브닝 리셉션",
    ],
    ["🇬🇧 UK planning", "UK planning"],
    ["1️⃣ First appointment", "First appointment"],
    ["👍🏽 - Confirm details", "Confirm details"],
    [
      "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F} Match",
      "Match",
    ],
    [".CLAY Studios: Gents Haircut", ".CLAY Studios: Gents Haircut"],
  ])("removes emoji from %s", (title, expected) => {
    expect(sanitizeCalendarEventTitle(title)).toBe(expected);
  });

  it("uses a safe fallback when a title contains only emoji", () => {
    expect(sanitizeCalendarEventTitle("🎉 💒")).toBe("Untitled event");
    expect(
      sanitizeCalendarEventTitle(
        "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
      ),
    ).toBe("Untitled event");
  });
});
