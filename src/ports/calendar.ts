export interface CalendarEvent {
  id: string;
  location?: string;
  startDate: string;
  startTime?: string;
  title: string;
}

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
