import { calendarLocalDayWindow } from "./calendar-local-day.js";

describe("calendar local-day window", () => {
  it.each([
    ["2026-03-29", "2026-03-29T00:00:00.000Z", "2026-03-29T23:00:00.000Z"],
    ["2026-10-25", "2026-10-24T23:00:00.000Z", "2026-10-26T00:00:00.000Z"],
  ])(
    "preserves exclusive midnight boundaries and date-only semantics on %s",
    (date, startAt, endBefore) => {
      const window = calendarLocalDayWindow({
        localDay: { date, timeZone: "Europe/London" },
      })!;
      expect(window.startAt).toBe(startAt);
      expect(window.endBefore).toBe(endBefore);
      expect(
        window.matches({
          id: "start",
          title: "Start",
          startDate: date,
          startAt,
          startTime: "00:00",
        }),
      ).toBe(true);
      expect(
        window.matches({
          id: "end",
          title: "End",
          startDate: date,
          startAt: endBefore,
          startTime: "00:00",
        }),
      ).toBe(false);
      expect(
        window.matches({ id: "all-day", title: "All day", startDate: date }),
      ).toBe(true);
    },
  );
});
