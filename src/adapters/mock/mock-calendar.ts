import type {
  CalendarEvent,
  CalendarSearchCriteria,
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
    getEvent: (id) =>
      Promise.resolve(calendarEvents.find((event) => event.id === id)),
    searchEvents: (criteria, options) =>
      Promise.resolve(
        calendarEvents.filter((event) =>
          matchesCriteria(event, criteria, options.now),
        ),
      ),
  };
}

function matchesCriteria(
  event: CalendarEvent,
  criteria: CalendarSearchCriteria,
  now: Date,
): boolean {
  const query = criteria.query?.trim().toLowerCase();
  const startDate = criteria.startDate ?? now.toISOString().slice(0, 10);
  const endDate = criteria.endDate;

  if (query && !event.title.toLowerCase().includes(query)) {
    return false;
  }

  if (event.startDate < startDate) {
    return false;
  }

  if (endDate && event.startDate > endDate) {
    return false;
  }

  return true;
}
