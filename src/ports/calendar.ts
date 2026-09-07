interface CalendarEventBase {
  id: string;
  location?: string;
  startDate: string;
  title: string;
}

export type CalendarEvent = CalendarEventBase &
  (
    | { startAt: string; startTime: string; endAt?: string }
    | { startAt?: never; startTime?: never; endAt?: never }
  );

export interface CalendarSearchPort {
  getEvent(
    id: string,
    options: CalendarSearchOptions,
  ): Promise<CalendarEvent | undefined>;
  searchEvents(
    criteria: CalendarSearchCriteria,
    options: CalendarSearchOptions,
  ): Promise<CalendarEvent[]>;
}

export interface CalendarSearchCriteria {
  /** Select event starts in this local day, including date-only events. */
  localDay?: { date: string; timeZone: string };
  endDate?: string;
  query?: string;
  startDate?: string;
}

export interface CalendarSearchOptions {
  now: Date;
}
