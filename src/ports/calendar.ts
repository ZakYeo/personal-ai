export interface CalendarEvent {
  id: string;
  startDate: string;
  title: string;
}

export interface CalendarSearchPort {
  searchEvents(
    query: string,
    options: CalendarSearchOptions,
  ): Promise<CalendarEvent[]>;
}

export interface CalendarSearchOptions {
  now: Date;
}
