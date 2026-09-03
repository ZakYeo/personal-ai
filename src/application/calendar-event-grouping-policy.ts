import { isSpokenTextSafe } from "./human-text.js";
import { sanitizeCalendarEventTitle } from "./calendar-presentation-policy.js";
import type {
  CalendarEventGroup,
  CalendarEventGrouping,
  CalendarEventGroupingInput,
} from "../ports/calendar-event-grouper.js";

const calendarEventGroupingLimits = Object.freeze({
  groups: 5,
  labelCharacters: 80,
  milestones: 4,
});

export function parseCalendarEventGrouping(
  value: unknown,
  events: CalendarEventGroupingInput["events"],
): CalendarEventGrouping {
  if (!isRecord(value) || !hasOnlyFields(value, ["groups"])) {
    throw new Error("Calendar event grouping must contain only groups.");
  }
  if (
    !Array.isArray(value.groups) ||
    value.groups.length > calendarEventGroupingLimits.groups
  ) {
    throw new Error(
      "Calendar event grouping must contain at most five groups.",
    );
  }

  const usedIndexes = new Set<number>();
  const groups = value.groups.map((group) =>
    parseGroup(group, events, usedIndexes),
  );
  return Object.freeze({ groups: Object.freeze(groups) });
}

function parseGroup(
  value: unknown,
  events: CalendarEventGroupingInput["events"],
  usedIndexes: Set<number>,
): CalendarEventGroup {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, ["eventIndexes", "milestones", "theme"])
  ) {
    throw new Error("Calendar event group has an invalid shape.");
  }
  const eventIndexes = parseIndexes(value.eventIndexes, events.length);
  if (eventIndexes.length < 2) {
    throw new Error("Calendar event groups must contain at least two events.");
  }
  const dates = new Set(eventIndexes.map((index) => events[index]?.startDate));
  if (dates.size !== 1 || dates.has(undefined)) {
    throw new Error("Calendar event groups must contain one calendar date.");
  }
  for (const index of eventIndexes) {
    if (usedIndexes.has(index)) {
      throw new Error("Calendar events cannot appear in multiple groups.");
    }
    usedIndexes.add(index);
  }
  const theme = parseSafeLabel(value.theme, "theme");
  if (
    !Array.isArray(value.milestones) ||
    value.milestones.length < 2 ||
    value.milestones.length > calendarEventGroupingLimits.milestones
  ) {
    throw new Error(
      "Calendar event groups must contain two to four milestones.",
    );
  }
  const groupIndexes = new Set(eventIndexes);
  const milestoneIndexes = new Set<number>();
  const milestones = value.milestones.map((milestone) => {
    if (
      !isRecord(milestone) ||
      !hasOnlyFields(milestone, ["eventIndex", "label"]) ||
      !Number.isInteger(milestone.eventIndex) ||
      !groupIndexes.has(milestone.eventIndex as number) ||
      milestoneIndexes.has(milestone.eventIndex as number)
    ) {
      throw new Error("Calendar event group milestone has an invalid index.");
    }
    const eventIndex = milestone.eventIndex as number;
    milestoneIndexes.add(eventIndex);
    return Object.freeze({
      eventIndex,
      label: parseSafeLabel(milestone.label, "milestone label"),
    });
  });
  assertStrictlyIncreasing(
    milestones.map(({ eventIndex }) => eventIndex),
    "Calendar event group milestones must be chronological.",
  );
  return Object.freeze({
    eventIndexes: Object.freeze(eventIndexes),
    milestones: Object.freeze(milestones),
    theme,
  });
}

function parseIndexes(value: unknown, eventCount: number): number[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (index) => Number.isInteger(index) && index >= 0 && index < eventCount,
    )
  ) {
    throw new Error("Calendar event group indexes are invalid.");
  }
  const indexes = value as number[];
  if (new Set(indexes).size !== indexes.length) {
    throw new Error("Calendar event group indexes must be unique.");
  }
  assertStrictlyIncreasing(
    indexes,
    "Calendar event group indexes must be chronological.",
  );
  return [...indexes];
}

function parseSafeLabel(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Calendar event group ${field} must be a string.`);
  }
  const label = value.trim();
  if (
    label.length < 1 ||
    label.length > calendarEventGroupingLimits.labelCharacters ||
    !isSpokenTextSafe(label) ||
    sanitizeCalendarEventTitle(label) !== label
  ) {
    throw new Error(`Calendar event group ${field} is not spoken-safe.`);
  }
  return label;
}

function assertStrictlyIncreasing(values: readonly number[], message: string) {
  if (values.some((value, index) => index > 0 && value <= values[index - 1]!)) {
    throw new Error(message);
  }
}

function hasOnlyFields(
  value: Record<string, unknown>,
  fields: readonly string[],
) {
  return Object.keys(value).every((field) => fields.includes(field));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
