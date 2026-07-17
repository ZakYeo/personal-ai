import { resolveLocalDateTime } from "./local-date-time.js";

describe("resolveLocalDateTime", () => {
  it("chooses the earlier instant for a repeated local time", () => {
    expect(
      resolveLocalDateTime(
        parts(2026, 10, 25, 1, 30),
        "Europe/London",
      ).toISOString(),
    ).toBe("2026-10-25T00:30:00.000Z");
  });

  it("moves a nonexistent local time forward across the DST gap", () => {
    expect(
      resolveLocalDateTime(
        parts(2026, 3, 29, 1, 30),
        "Europe/London",
      ).toISOString(),
    ).toBe("2026-03-29T01:30:00.000Z");
  });
});

function parts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  return { day, hour, millisecond: 0, minute, month, second: 0, year };
}
