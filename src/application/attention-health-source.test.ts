import { createTestAlarmStore } from "../test-support/alarm-store.js";
import { createAttentionHealthSource } from "./attention-health-source.js";
import { createTestAttentionStore } from "../test-support/attention.js";
import type { TaskRecord } from "../ports/task-store.js";

const now = new Date("2026-09-07T12:00:00.000Z");
const task: TaskRecord = {
  id: "private-task",
  label: "Review",
  listId: "private-list",
  revision: 3,
  status: "open",
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  reminder: {
    status: "claimed",
    claimedAt: "2026-09-07T11:55:00.000Z",
    scheduledFor: "2026-09-07T11:54:00.000Z",
  },
};
it("reads uncertain reminder state without copying private targets or claiming success", async () => {
  const source = createAttentionHealthSource({
    reportDiagnostic: () => {},
    attention: createTestAttentionStore({ timeZone: "Europe/London" }),
    tasks: { listTasks: () => Promise.resolve([task]) },
    timeZone: "Europe/London",
  });
  const result = await source.read(now);
  expect(result).toHaveLength(1);
  expect(result[0]?.text).toContain("unknown");
  expect(JSON.stringify(result[0]?.facts)).not.toContain("private-");
});
it("does not report an in-flight or acknowledged reminder as uncertain", async () => {
  const source = createAttentionHealthSource({
    reportDiagnostic: () => {},
    attention: createTestAttentionStore({ timeZone: "Europe/London" }),
    tasks: {
      listTasks: () =>
        Promise.resolve([
          {
            ...task,
            reminder: {
              status: "claimed",
              claimedAt: now.toISOString(),
              scheduledFor: now.toISOString(),
            },
          },
        ]),
    },
    timeZone: "Europe/London",
  });
  expect(await source.read(now)).toEqual([]);
});

it("does not create a new actionable delivery problem for a completed task", async () => {
  const source = createAttentionHealthSource({
    reportDiagnostic: () => {},
    attention: createTestAttentionStore({ timeZone: "Europe/London" }),
    tasks: {
      listTasks: () =>
        Promise.resolve([
          { ...task, status: "completed", completedAt: now.toISOString() },
        ]),
    },
    timeZone: "Europe/London",
  });
  expect(await source.read(now)).toEqual([]);
});

it("retains missed alarms when tasks and diagnostic reporting fail", async () => {
  const alarms = createTestAlarmStore();
  const alarm = await alarms.add({
    label: "Review",
    scheduledFor: now.toISOString(),
  });
  await alarms.update({
    id: alarm.id,
    expectedRevision: alarm.revision,
    updatedAt: now.toISOString(),
    changes: { status: "missed", nextDeliveryAt: null },
  });
  const failure = new Error("private task failure");
  const reportDiagnostic = vi.fn(() => {
    throw new Error("logger failed");
  });
  const source = createAttentionHealthSource({
    attention: createTestAttentionStore({ timeZone: "Europe/London" }),
    tasks: { listTasks: () => Promise.reject(failure) },
    alarms,
    timeZone: "Europe/London",
    reportDiagnostic,
  });
  expect((await source.read(now))[0]?.facts.problem).toBe("alarm_missed");
  expect(reportDiagnostic).toHaveBeenCalledWith(failure);
});

it("retains uncertain reminders when the alarm read fails", async () => {
  const failure = new Error("private alarm failure");
  const reportDiagnostic = vi.fn();
  const source = createAttentionHealthSource({
    attention: createTestAttentionStore({ timeZone: "Europe/London" }),
    tasks: { listTasks: () => Promise.resolve([task]) },
    alarms: { list: () => Promise.reject(failure) },
    timeZone: "Europe/London",
    reportDiagnostic,
  });
  expect((await source.read(now))[0]?.facts.problem).toBe(
    "reminder_delivery_unknown",
  );
  expect(reportDiagnostic).toHaveBeenCalledWith(failure);
});
