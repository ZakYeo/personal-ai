import type {
  AttentionCandidate,
  AttentionRuleDefinition,
} from "../ports/attention.js";
import type { CalendarEvent, CalendarSearchPort } from "../ports/calendar.js";

type CalendarRule = Extract<
  AttentionRuleDefinition,
  { kind: "upcoming_calendar" | "conflicting_commitments" }
>;
export async function readCalendarAttention(
  calendar: Pick<CalendarSearchPort, "searchEvents">,
  definition: CalendarRule,
  now: Date,
  timeZone: string,
): Promise<AttentionCandidate[]> {
  const horizon =
    now.getTime() +
    (definition.kind === "upcoming_calendar"
      ? definition.leadMinutes * 60_000
      : definition.lookAheadHours * 3_600_000);
  // Widen date-only search bounds, then filter exact instants across event timezones.
  const events = (
    await calendar.searchEvents(
      {
        startDate: new Date(now.getTime() - 86_400_000)
          .toISOString()
          .slice(0, 10),
        endDate: new Date(horizon + 86_400_000).toISOString().slice(0, 10),
      },
      { now },
    )
  )
    .filter(
      (event) =>
        event.startAt &&
        Date.parse(event.startAt) <= horizon &&
        (definition.kind === "upcoming_calendar"
          ? Date.parse(event.startAt) >= now.getTime()
          : Date.parse(event.endAt ?? event.startAt) > now.getTime()),
    )
    .sort(
      (a, b) =>
        a.startAt!.localeCompare(b.startAt!) || a.id.localeCompare(b.id),
    )
    .slice(0, 100);
  if (definition.kind === "upcoming_calendar")
    return events.slice(0, 10).map((event) => ({
      key: `${event.id}:${event.startAt}`,
      text: `${event.title} starts at ${event.startAt}.`,
      explanation: `This event starts within your ${definition.leadMinutes}-minute notice period.`,
      timeZone,
      facts: { title: event.title, startAt: event.startAt! },
    }));
  const candidates: AttentionCandidate[] = [];
  for (
    let index = 0;
    index < events.length && candidates.length < 10;
    index += 1
  ) {
    const first = events[index]!;
    for (const second of events.slice(index + 1)) {
      if (candidates.length >= 10) break;
      if (overlap(first, second))
        candidates.push({
          key: `${first.id}:${first.startAt}:${first.endAt ?? ""}:${second.id}:${second.startAt}:${second.endAt ?? ""}`,
          text: `${first.title} and ${second.title} have conflicting times.`,
          explanation:
            "Their explicit calendar times overlap. No event has been changed.",
          timeZone,
          facts: {
            firstTitle: first.title,
            firstStartAt: first.startAt!,
            secondTitle: second.title,
            secondStartAt: second.startAt!,
            ...(first.endAt ? { firstEndAt: first.endAt } : {}),
            ...(second.endAt ? { secondEndAt: second.endAt } : {}),
          },
        });
    }
  }
  return candidates;
}
function overlap(first: CalendarEvent, second: CalendarEvent): boolean {
  if (!first.startAt || !second.startAt) return false;
  if (first.startAt === second.startAt) return true;
  return (
    !!first.endAt &&
    !!second.endAt &&
    first.startAt < second.endAt &&
    second.startAt < first.endAt
  );
}
