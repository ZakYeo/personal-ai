import {
  createFeatureContext,
  expectCapabilityMetadata,
  expectDecodedFeatureExecution,
} from "../../test-support/feature-contract.js";
import { createTestTaskStore } from "../../test-support/task-store.js";
import { createTaskFeature } from "./task-feature.js";

describe("task reminder acknowledgement capability", () => {
  it("is a low-risk exact-task lifecycle operation", () => {
    expectCapabilityMetadata(createTaskFeature(createTestTaskStore()), {
      name: "task.reminder.acknowledge",
      parameters: {
        id: { type: "string" },
        label: { type: "string" },
        listName: { type: "string" },
        ordinal: { type: "number" },
        reference: { type: "string" },
      },
      risk: "low",
    });
  });

  it("acknowledges one delivered reminder without completing its task", async () => {
    const store = createTestTaskStore();
    const list = await store.addList({ name: "To-do" });
    const task = await store.addTask({
      label: "Submit form",
      listId: list.id,
      reminderAt: "2026-06-26T10:00:00.000Z",
    });
    const claimed = await store.claimReminder({
      claimedAt: "2026-06-26T10:00:00.000Z",
      expectedRevision: task.revision,
      id: task.id,
    });
    const delivered = await store.markReminderDelivered({
      deliveredAt: "2026-06-26T10:00:01.000Z",
      expectedRevision: claimed!.revision,
      id: task.id,
    });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.reminder.acknowledge",
      { label: "Submit form", listName: "To-do" },
      {
        data: {
          acknowledgedAt: "2026-06-26T12:00:00.000Z",
          id: task.id,
          label: "Submit form",
          listId: list.id,
          listName: "To-do",
          reminderAt: "2026-06-26T10:00:00.000Z",
          reminderStatus: "acknowledged",
          revision: delivered!.revision + 1,
          status: "open",
        },
        text: "Acknowledged the reminder for Submit form on your To-do list.",
      },
      {
        ...createFeatureContext(),
        clock: { now: () => new Date("2026-06-26T12:00:00.000Z") },
      },
    );
  });

  it("calculates ambiguity only among claimable reminder outcomes", async () => {
    const store = createTestTaskStore();
    const firstList = await store.addList({ name: "Work" });
    const secondList = await store.addList({ name: "Personal" });
    await store.addTask({
      label: "Follow up",
      listId: firstList.id,
      reminderAt: "2026-06-27T10:00:00.000Z",
    });
    const deliveredTask = await store.addTask({
      label: "Follow up",
      listId: secondList.id,
      reminderAt: "2026-06-26T10:00:00.000Z",
    });
    const claimed = await store.claimReminder({
      claimedAt: "2026-06-26T10:00:00.000Z",
      expectedRevision: deliveredTask.revision,
      id: deliveredTask.id,
    });
    await store.markReminderDelivered({
      deliveredAt: "2026-06-26T10:00:01.000Z",
      expectedRevision: claimed!.revision,
      id: deliveredTask.id,
    });

    const response = await createTaskFeature(store).execute(
      {
        args: { label: "Follow up" },
        capability: "task.reminder.acknowledge",
        command: {
          capability: "task.reminder.acknowledge",
          parameters: { label: "Follow up" },
          rawText: "acknowledge follow up",
        },
      },
      {
        capabilityCatalog: [],
        clock: { now: () => new Date("2026-06-26T12:00:00.000Z") },
        config: {
          assistant: {
            name: "Jarvis",
            timeZone: "Europe/London",
            wakePhrases: ["hey jarvis"],
          },
          features: { tasks: { enabled: true } },
        },
        trustedInputText: "acknowledge follow up",
      },
    );

    expect(response.text).toBe(
      "Acknowledged the reminder for Follow up on your Personal list.",
    );
  });
});
