import type {
  CalendarEvent,
  CalendarSearchPort,
} from "../../ports/calendar.js";

const calendarEvents: CalendarEvent[] = [
  {
    id: "wedding-2026",
    title: "Upcoming wedding",
    startDate: "2026-09-12",
  },
];

export function createMockCalendar(): CalendarSearchPort {
  return {
    searchEvents: (query: string) =>
      Promise.resolve(
        calendarEvents.filter((event) =>
          event.title.toLowerCase().includes(query.toLowerCase()),
        ),
      ),
  };
}
