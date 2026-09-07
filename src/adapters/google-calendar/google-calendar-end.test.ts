import { parseGoogleCalendarEvent } from "./google-calendar-events-parser.js";

const event = {
  id: "meeting",
  summary: "Planning",
  start: { dateTime: "2026-09-07T10:00:00+01:00" },
};
describe("calendar duration facts", () => {
  it("preserves an explicit end instant for overlap evaluation", () => {
    expect(
      parseGoogleCalendarEvent({
        ...event,
        end: { dateTime: "2026-09-07T11:00:00+01:00" },
      }),
    ).toMatchObject({
      startAt: "2026-09-07T09:00:00.000Z",
      endAt: "2026-09-07T10:00:00.000Z",
    });
  });
  it.each(["2026-09-07T08:00:00Z", "broken"])(
    "rejects invalid or backward duration %s",
    (dateTime) => {
      expect(() =>
        parseGoogleCalendarEvent({ ...event, end: { dateTime } }),
      ).toThrow();
    },
  );
  it("keeps missing durations absent", () => {
    expect(parseGoogleCalendarEvent(event)).not.toHaveProperty("endAt");
  });
});
