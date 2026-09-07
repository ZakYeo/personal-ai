import { createAttentionDayPlan } from "./attention-day-plan.js";
import type { TaskRecord } from "../ports/task-store.js";

it("returns at most three read-only priorities with exact facts and isolated missing sources", async () => {
  const now = new Date("2026-09-07T12:00:00.000Z");
  const tasks: TaskRecord[] = Array.from({ length: 5 }, (_, index) => ({
    id: `task-${index}`,
    label: `Task ${index}`,
    listId: "work",
    revision: 1,
    status: "open",
    dueDate: "2026-09-06",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }));
  const result = await createAttentionDayPlan(
    { tasks: { listTasks: () => Promise.resolve(tasks) } },
    { now, timeZone: "Europe/London", reportDiagnostic: () => {} },
  );
  expect(result.facts.count).toBe(3);
  expect(result.facts.item0DueDate).toBe("2026-09-06");
  expect(result.text).toContain("calendar is unavailable");
  expect(result.text).not.toContain("Task 3");
});

it("keeps all-day calendar planning explicit and removes title emoji", async () => {
  const result = await createAttentionDayPlan(
    {
      calendar: {
        searchEvents: () =>
          Promise.resolve([
            { id: "event", startDate: "2026-09-07", title: "🎉 Leave" },
          ]),
      },
    },
    {
      now: new Date("2026-09-07T12:00:00.000Z"),
      timeZone: "Europe/London",
      reportDiagnostic: () => {},
    },
  );
  expect(result.text).toContain("Leave, an all-day event");
  expect(result.facts.item0Title).toBe("Leave");
});
