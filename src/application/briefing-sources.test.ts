import type { CalendarEvent, CalendarSearchPort } from "../ports/calendar.js";
import { createCalendarBriefingSource } from "./briefing-sources.js";

describe("briefing sources", () => {
  it("uses stable opaque calendar keys when provider ordering changes", async () => {
    let events: CalendarEvent[] = [
      {
        id: "private-provider-id-one",
        startAt: "2026-09-04T08:00:00.000Z",
        startDate: "2026-09-04",
        startTime: "09:00",
        title: "Standup",
      },
      {
        id: "private-provider-id-two",
        startAt: "2026-09-04T10:00:00.000Z",
        startDate: "2026-09-04",
        startTime: "11:00",
        title: "Planning",
      },
    ];
    const calendar: CalendarSearchPort = {
      getEvent: () => Promise.resolve(undefined),
      searchEvents: () => Promise.resolve(events),
    };
    const source = createCalendarBriefingSource(calendar);
    const context = {
      now: new Date("2026-09-04T07:00:00.000Z"),
      timeZone: "Europe/London",
    };
    const first = await source.read(context);
    events = [events[1]!, events[0]!];
    const second = await source.read(context);
    const keyByText = (items: typeof first.items) =>
      Object.fromEntries(items.map(({ key, text }) => [text, key]));

    expect(keyByText(second.items)).toEqual(keyByText(first.items));
    expect(first.items.map(({ key }) => key).join(" ")).not.toContain(
      "private-provider-id",
    );
  });
});
