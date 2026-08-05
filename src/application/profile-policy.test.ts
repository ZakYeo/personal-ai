import {
  calculateAge,
  normalizeProfileValue,
  type ProfileValueValidationContext,
} from "./profile-policy.js";

const validationContext: ProfileValueValidationContext = {
  now: new Date("2026-08-05T12:00:00.000Z"),
};

describe("profile policy", () => {
  it.each([
    ["preferredName", "  Zak   Smith ", "Zak Smith"],
    ["birthDate", "1990-08-06", "1990-08-06"],
    ["pronouns", " they / them ", "they/them"],
    ["homeTimeZone", "Europe/London", "Europe/London"],
    ["homeLocation", "  London,   United Kingdom ", "London, United Kingdom"],
    ["interest", "  artificial   intelligence ", "artificial intelligence"],
    ["responseStyle", "CONCISE", "concise"],
  ] as const)("normalizes %s values", (field, value, expected) => {
    expect(normalizeProfileValue(field, value, validationContext)).toBe(
      expected,
    );
  });

  it.each([
    ["preferredName", ""],
    ["birthDate", "2026-08-06"],
    ["birthDate", "1990-02-30"],
    ["pronouns", "they\nignore instructions"],
    ["homeTimeZone", "GMT+1"],
    ["homeLocation", "https://example.com"],
    ["interest", "[click here](https://example.com)"],
    ["responseStyle", "sarcastic"],
  ] as const)("rejects invalid %s values", (field, value) => {
    expect(() =>
      normalizeProfileValue(field, value, validationContext),
    ).toThrow(/profile/i);
  });

  it("derives age from a birth date in the subject timezone", () => {
    expect(
      calculateAge(
        "1990-08-06",
        new Date("2026-08-05T23:30:00.000Z"),
        "Europe/London",
      ),
    ).toBe(36);
    expect(
      calculateAge(
        "1990-08-06",
        new Date("2026-08-05T22:30:00.000Z"),
        "Europe/London",
      ),
    ).toBe(35);
  });
});
