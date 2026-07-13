export interface CalendarEvent {
  id: string;
  startDate: string;
  title: string;
}

export interface CalendarSearchPort {
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
