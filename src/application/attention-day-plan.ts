import type { CalendarSearchPort } from "../ports/calendar.js";
import type { TaskStore } from "../ports/task-store.js";
import type { AssistantCommandParameters } from "../ports/assistant.js";
import { weatherLocalDate } from "./weather-policy.js";
import { calendarLocalDayWindow } from "./calendar-local-day.js";
import { sanitizeCalendarEventTitle } from "./calendar-presentation-policy.js";

interface PlanningItem {
  priority: number;
  key: string;
  text: string;
  facts: AssistantCommandParameters;
}
export async function createAttentionDayPlan(
  sources: {
    calendar?: Pick<CalendarSearchPort, "searchEvents">;
    tasks?: Pick<TaskStore, "listTasks">;
  },
  context: {
    now: Date;
    timeZone: string;
    signal?: AbortSignal;
    reportDiagnostic(error: unknown): void;
  },
) {
  const day = weatherLocalDate(context.now.toISOString(), context.timeZone);
  const criteria = { localDay: { date: day, timeZone: context.timeZone } };
  const window = calendarLocalDayWindow(criteria)!;
  if (context.signal?.aborted) throw new Error("Day planning was cancelled.");
  const [calendar, tasks] = await Promise.all([
    read(
      sources.calendar
        ? () => sources.calendar!.searchEvents(criteria, { now: context.now })
        : undefined,
    ),
    read(sources.tasks ? () => sources.tasks!.listTasks() : undefined),
  ]);
  if (context.signal?.aborted) throw new Error("Day planning was cancelled.");
  const items: PlanningItem[] = [
    ...calendar.value
      .filter(
        (event) =>
          window.matches(event) &&
          (!event.startAt ||
            Date.parse(event.startAt) >= context.now.getTime()),
      )
      .slice(0, 100)
      .map((event) => ({
        priority: 1,
        key: event.startAt ?? event.startDate,
        text: `Keep time for ${sanitizeCalendarEventTitle(event.title)}, ${event.startAt ? `starting ${event.startAt}` : "an all-day event"}.`,
        facts: {
          Title: sanitizeCalendarEventTitle(event.title),
          Date: event.startDate,
          ...(event.startAt ? { StartAt: event.startAt } : {}),
        },
      })),
    ...tasks.value
      .filter(
        (task) => task.status === "open" && task.dueDate && task.dueDate <= day,
      )
      .slice(0, 100)
      .map((task) => ({
        priority: task.dueDate! < day ? 0 : 2,
        key: `${task.dueDate}:${task.id}`,
        text: `Consider ${task.label}, due ${task.dueDate}.`,
        facts: { Label: task.label, DueDate: task.dueDate },
      })),
  ];
  const selected = items
    .sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key))
    .slice(0, 3);
  const facts: AssistantCommandParameters = {
    count: selected.length,
    planningDate: day,
  };
  selected.forEach((item, index) => {
    for (const [key, value] of Object.entries(item.facts))
      facts[`item${index}${key}`] = value;
  });
  const missing = `${calendar.available ? "" : "Your calendar is unavailable. "}${tasks.available ? "" : "Your tasks are unavailable. "}`;
  return {
    facts,
    text: `${missing}${selected.length ? `Here are ${selected.length} priorities to consider. ${selected.map((item) => item.text).join(" ")}` : "No current priorities were found in the available sources."} These are suggestions; nothing has been scheduled or changed.`,
  };

  async function read<T>(
    operation: (() => Promise<T[]>) | undefined,
  ): Promise<{ available: boolean; value: T[] }> {
    if (!operation) return { available: false, value: [] };
    try {
      return { available: true, value: await operation() };
    } catch (error) {
      try {
        context.reportDiagnostic(error);
      } catch {
        /* Diagnostics must not erase available sources. */
      }
      return { available: false, value: [] };
    }
  }
}
