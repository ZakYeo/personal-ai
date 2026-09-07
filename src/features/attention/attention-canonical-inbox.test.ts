import { createAttentionFeature } from "./attention-feature.js";
import { createTestAttentionStore } from "../../test-support/attention.js";
import { createTestTaskStore } from "../../test-support/task-store.js";
import {
  createFeatureContext,
  executeFeature,
} from "../../test-support/feature-contract.js";
import { enableAttentionRule } from "../../application/attention-commands.js";
import { createAttentionHealthSource } from "../../application/attention-health-source.js";
import { processAttentionCycle } from "../../application/attention-engine.js";

it.each([
  ["acknowledge", "already been acknowledged"],
  ["complete", "no longer current"],
  ["cancel", "no longer current"],
  ["reschedule", "no longer current"],
  ["remove", "no longer current"],
  ["deliver", "now records completed delivery"],
])(
  "reflects canonical reminder %s without overwriting historical delivery or user acknowledgement",
  async (action, expected) => {
    const now = new Date("2026-09-07T12:00:00.000Z");
    const tasks = createTestTaskStore();
    const list = await tasks.addList({ name: "Work" });
    const task = await tasks.addTask({
      listId: list.id,
      label: "Review",
      reminderAt: "2026-09-07T11:00:00.000Z",
    });
    const claim = (await tasks.claimReminder({
      id: task.id,
      expectedRevision: task.revision,
      claimedAt: "2026-09-07T11:00:00.000Z",
    }))!;
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
    const selected = { id: task.id, expectedRevision: claim.revision };
    if (action === "acknowledge")
      await tasks.acknowledgeReminder({
        ...selected,
        acknowledgedAt: now.toISOString(),
      });
    else if (action === "deliver")
      await tasks.markReminderDelivered({
        ...selected,
        deliveredAt: now.toISOString(),
      });
    else if (action === "remove") await tasks.removeTask(selected);
    else if (action === "reschedule" || action === "cancel") {
      // A started claim is immutable. Canonical acknowledgement and retention must precede replacement.
      await tasks.acknowledgeReminder({
        ...selected,
        acknowledgedAt: now.toISOString(),
      });
      await tasks.clearTerminalRemindersBefore({
        cutoff: "2026-09-07T12:00:00.001Z",
        updatedAt: "2026-09-07T12:00:00.001Z",
      });
      const current = (await tasks.listTasks())[0]!;
      const replacement = (await tasks.updateTask({
        id: task.id,
        expectedRevision: current.revision,
        updatedAt: "2026-09-07T12:00:00.001Z",
        changes: { reminderAt: "2026-09-08T11:00:00.000Z" },
      }))!;
      if (action === "cancel")
        await tasks.updateTask({
          id: task.id,
          expectedRevision: replacement.revision,
          updatedAt: "2026-09-07T12:00:00.001Z",
          changes: { reminderAt: null },
        });
    } else
      await tasks.updateTask({
        ...selected,
        updatedAt: now.toISOString(),
        changes: { status: "completed" },
      });
    const canonical = await tasks.listTasks();
    const feature = createAttentionFeature(store, { tasks });
    const context = { ...createFeatureContext(), clock: { now: () => now } };
    for (const capability of [
      "attention.inbox.list",
      "attention.inbox.explain",
    ]) {
      const result = await executeFeature(
        feature,
        capability,
        capability.endsWith("explain") ? { id: item.id } : {},
        context,
      );
      expect(result.text).toContain(expected);
    }
    expect((await store.read()).inbox[0]).toEqual(item);
    const updated = await executeFeature(
      feature,
      "attention.inbox.update",
      {
        id: item.id,
        expectedRevision: item.revision,
        action: "resolve_reminder",
      },
      context,
    );
    expect(updated.data?.changed).toBe(true);
    const after = await tasks.listTasks();
    expect(action === "deliver" ? after[0]?.reminder?.status : after).toEqual(
      action === "deliver" ? "acknowledged" : canonical,
    );
    expect((await store.read()).inbox[0]).toMatchObject({
      status: "acknowledged",
      delivery: item.delivery,
    });
  },
);
