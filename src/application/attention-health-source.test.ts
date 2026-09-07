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
