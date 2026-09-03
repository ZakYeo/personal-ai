import type { CalendarEventGrouperPort } from "../../ports/calendar-event-grouper.js";

export function createMockCalendarEventGrouper(): CalendarEventGrouperPort {
  return {
    group: () => Promise.resolve({ groups: [] }),
  };
}
