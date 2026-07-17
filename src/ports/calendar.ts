interface CalendarEventBase {
  id: string;
  location?: string;
  startDate: string;
  title: string;
}

export type CalendarEvent = CalendarEventBase &
  (
    | { startAt: string; startTime: string }
    | { startAt?: never; startTime?: never }
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
  endDate?: string;
  query?: string;
  startDate?: string;
}

export interface CalendarSearchOptions {
  now: Date;
}
