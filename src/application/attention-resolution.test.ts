import { createTestTaskStore } from "../test-support/task-store.js";
import { createTestAttentionStore } from "../test-support/attention.js";
import { enableAttentionRule } from "./attention-commands.js";
import { createAttentionHealthSource } from "./attention-health-source.js";
import { processAttentionCycle } from "./attention-engine.js";
import { resolveAttentionReminder } from "./attention-resolution.js";

it("acknowledges the exact uncertain reminder without completing or replaying its task", async () => {
  const now = new Date("2026-09-07T12:00:00.000Z");
  const tasks = createTestTaskStore();
  const list = await tasks.addList({ name: "Work" });
  const task = await tasks.addTask({
    listId: list.id,
    label: "Review",
    reminderAt: "2026-09-07T11:00:00.000Z",
  });
  await tasks.claimReminder({
    id: task.id,
    expectedRevision: task.revision,
    claimedAt: "2026-09-07T11:00:00.000Z",
  });
  const store = createTestAttentionStore({ timeZone: "Europe/London" });
  await enableAttentionRule(
    store,
    {
      name: "Health",
      definition: { kind: "runtime_health" },
      timeZone: "Europe/London",
      request: "Notify me about delivery problems",
    },
    now,
  );
  const health = createAttentionHealthSource({
    attention: store,
    tasks,
    timeZone: "Europe/London",
  });
  await processAttentionCycle({
    store,
    reader: { read: () => health.read(now) },
    clock: { now: () => now },
    reportFailure: () => {},
  });
  const item = (await store.read()).inbox[0]!;
  expect(
    await resolveAttentionReminder(
      store,
      tasks,
      { id: item.id, expectedRevision: item.revision },
      now,
    ),
  ).toBe(true);
  expect((await tasks.listTasks())[0]).toMatchObject({
    status: "open",
    reminder: { status: "acknowledged" },
  });
  expect((await store.read()).inbox[0]?.status).toBe("acknowledged");
  expect(
    await resolveAttentionReminder(
      store,
      tasks,
      { id: item.id, expectedRevision: item.revision },
      now,
    ),
  ).toBe(false);
});
