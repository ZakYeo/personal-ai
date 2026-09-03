export interface CalendarEventGroupingInput {
  readonly events: readonly CalendarEventGroupingCandidate[];
}

export interface CalendarEventGroupingCandidate {
  readonly index: number;
  readonly startDate: string;
  readonly startTime?: string;
  readonly title: string;
}

export interface CalendarEventGroup {
  readonly eventIndexes: readonly number[];
  readonly milestones: readonly CalendarEventGroupMilestone[];
  readonly theme: string;
}

export interface CalendarEventGroupMilestone {
  readonly eventIndex: number;
  readonly label: string;
}

export interface CalendarEventGrouping {
  readonly groups: readonly CalendarEventGroup[];
}

export interface CalendarEventGrouperPort {
  group(
    input: CalendarEventGroupingInput,
    options?: { readonly signal?: AbortSignal },
  ): Promise<CalendarEventGrouping>;
}
