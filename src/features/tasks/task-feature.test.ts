import {
  createFeatureContext,
  expectCapabilityMetadata,
  expectDecodedFeatureExecution,
} from "../../test-support/feature-contract.js";
import type { FeatureExecutionContext } from "../../ports/feature.js";
import { createTestTaskStore } from "../../test-support/task-store.js";
import { createTaskFeature } from "./task-feature.js";

describe("createTaskFeature list capabilities", () => {
  it("declares typed list capabilities with safe risk metadata", () => {
    const feature = createTaskFeature(createTestTaskStore());

    expectCapabilityMetadata(feature, {
      name: "task.list.create",
      parameters: {
        name: { required: true, type: "string" },
      },
      risk: "low",
    });
    expectCapabilityMetadata(feature, {
      name: "task.list.show",
      parameters: {
        name: { type: "string" },
      },
      risk: "low",
      toolChain: "read",
    });
    expectCapabilityMetadata(feature, {
      name: "task.list.rename",
      parameters: {
        name: { required: true, type: "string" },
        newName: { required: true, type: "string" },
      },
      risk: "low",
    });
  });

  it("creates a named list and preserves exact result facts", async () => {
    const store = createTestTaskStore();

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.list.create",
      { name: "  Shopping  " },
      {
        data: {
          id: "task-list-1",
          name: "Shopping",
          revision: 1,
        },
        text: "Created the Shopping list.",
      },
    );
  });

  it("shows named lists and their current tasks", async () => {
    const store = createTestTaskStore();
    const shopping = await store.addList({ name: "Shopping" });
    await store.addTask({ label: "Coffee", listId: shopping.id });
    await store.addTask({ label: "Oat milk", listId: shopping.id });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.list.show",
      { name: "shopping" },
      {
        data: {
          listId: shopping.id,
          listName: "Shopping",
          task0Id: "task-1",
          task0Label: "Coffee",
          task0Status: "open",
          task1Id: "task-2",
          task1Label: "Oat milk",
          task1Status: "open",
          taskCount: 2,
        },
        resultReferences: {
          items: [
            {
              facts: {
                label: "Coffee",
                listName: "Shopping",
                status: "open",
              },
              target: {
                kind: "task_item",
                listId: shopping.id,
                listRevision: shopping.revision,
                revision: 1,
                taskId: "task-1",
              },
            },
            {
              facts: {
                label: "Oat milk",
                listName: "Shopping",
                status: "open",
              },
              target: {
                kind: "task_item",
                listId: shopping.id,
                listRevision: shopping.revision,
                revision: 1,
                taskId: "task-2",
              },
            },
          ],
          kind: "task_items",
        },
        text: "Your Shopping list has Coffee and Oat milk.",
      },
    );
  });

  it("lists available names when no specific list is requested", async () => {
    const store = createTestTaskStore();
    await store.addList({ name: "Shopping" });
    await store.addList({ name: "To-do" });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.list.show",
      {},
      {
        data: {
          list0Id: "task-list-1",
          list0Name: "Shopping",
          list1Id: "task-list-2",
          list1Name: "To-do",
          listCount: 2,
        },
        resultReferences: { items: [], kind: "task_items" },
        text: "You have Shopping and To-do lists.",
      },
    );
  });

  it("renames the currently selected list by revision", async () => {
    const store = createTestTaskStore();
    const list = await store.addList({ name: "Errands" });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.list.rename",
      { name: "errands", newName: "Weekend errands" },
      {
        data: {
          id: list.id,
          name: "Weekend errands",
          revision: 2,
        },
        text: "Renamed the Errands list to Weekend errands.",
      },
      createFeatureContext(),
    );
  });

  it("responds safely when a requested list does not exist", async () => {
    await expectDecodedFeatureExecution(
      createTaskFeature(createTestTaskStore()),
      "task.list.show",
      { name: "Shopping" },
      {
        resultReferences: { items: [], kind: "task_items" },
        text: "I could not find a list named Shopping.",
      },
    );
  });

  it("clears older task references when the selected list is empty", async () => {
    const store = createTestTaskStore();
    const list = await store.addList({ name: "Shopping" });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.list.show",
      { name: "Shopping" },
      {
        data: { listId: list.id, listName: "Shopping", taskCount: 0 },
        resultReferences: { items: [], kind: "task_items" },
        text: "Your Shopping list is empty.",
      },
    );
  });
});

describe("createTaskFeature task creation capabilities", () => {
  it("separates low-risk task creation from confirmed reminder creation", () => {
    const feature = createTaskFeature(createTestTaskStore());

    expectCapabilityMetadata(feature, {
      name: "task.create",
      parameters: {
        dueDate: { type: "string" },
        label: { required: true, type: "string" },
        listName: { required: true, type: "string" },
        note: { type: "string" },
      },
      risk: "low",
    });
    expectCapabilityMetadata(feature, {
      name: "task.remind",
      parameters: {
        dueDate: { type: "string" },
        label: { required: true, type: "string" },
        listName: { required: true, type: "string" },
        note: { type: "string" },
        reminderAt: { required: true, type: "string" },
      },
      requiresConfirmation: true,
      risk: "high",
    });
  });

  it("adds an ordinary task to an exact named list", async () => {
    const store = createTestTaskStore();
    const list = await store.addList({ name: "To-do" });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.create",
      {
        dueDate: "2026-07-30",
        label: "Submit the form",
        listName: "to-do",
        note: "Use the signed copy",
      },
      {
        data: {
          dueDate: "2026-07-30",
          id: "task-1",
          label: "Submit the form",
          listId: list.id,
          listName: "To-do",
          note: "Use the signed copy",
          revision: 1,
          status: "open",
        },
        resultReferences: {
          items: [
            {
              facts: {
                dueDate: "2026-07-30",
                label: "Submit the form",
                listName: "To-do",
                status: "open",
              },
              target: {
                kind: "task_item",
                listId: list.id,
                listRevision: list.revision,
                revision: 1,
                taskId: "task-1",
              },
            },
          ],
          kind: "task_items",
        },
        text: "Added Submit the form to your To-do list.",
      },
    );
  });

  it("renders and persists an exact confirmed reminder snapshot", async () => {
    const store = createTestTaskStore();
    const list = await store.addList({ name: "To-do" });
    const feature = createTaskFeature(store);
    const capability = feature.capabilities.find(
      ({ name }) => name === "task.remind",
    );
    const args = {
      label: "Submit the form",
      listName: "To-do",
      reminderAt: "2026-07-29T08:00:00.000Z",
    };

    expect(
      capability?.renderConfirmation?.(args, createFeatureContext()),
    ).toEqual({
      facts: {
        label: "Submit the form",
        listName: "To-do",
        reminderAt: "2026-07-29T08:00:00.000Z",
      },
      text: "create Submit the form on the To-do list with a reminder for 2026-07-29T08:00:00.000Z",
    });

    await expectDecodedFeatureExecution(
      feature,
      "task.remind",
      args,
      {
        data: {
          id: "task-1",
          label: "Submit the form",
          listId: list.id,
          listName: "To-do",
          reminderAt: "2026-07-29T08:00:00.000Z",
          reminderStatus: "scheduled",
          revision: 1,
          status: "open",
        },
        resultReferences: {
          items: [
            {
              facts: {
                label: "Submit the form",
                listName: "To-do",
                reminderAt: "2026-07-29T08:00:00.000Z",
                status: "open",
              },
              target: {
                kind: "task_item",
                listId: list.id,
                listRevision: list.revision,
                revision: 1,
                taskId: "task-1",
              },
            },
          ],
          kind: "task_items",
        },
        text: "Added Submit the form to your To-do list with a reminder for 2026-07-29T08:00:00.000Z.",
      },
      {
        ...createFeatureContext(),
        validatedConfirmationFacts: {
          label: "Submit the form",
          listName: "To-do",
          reminderAt: "2026-07-29T08:00:00.000Z",
        },
      },
    );
  });

  it("does not create a task when the named list is absent", async () => {
    const store = createTestTaskStore();

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.create",
      { label: "Submit the form", listName: "To-do" },
      { text: "I could not find a list named To-do." },
    );
    expect(await store.listTasks()).toEqual([]);
  });
});

describe("createTaskFeature task completion capabilities", () => {
  it("declares reversible completion operations as low risk", () => {
    const feature = createTaskFeature(createTestTaskStore());
    const parameters = {
      id: { type: "string" },
      label: { type: "string" },
      listName: { type: "string" },
      ordinal: { type: "number" },
      reference: { type: "string" },
    } as const;

    expectCapabilityMetadata(feature, {
      name: "task.complete",
      parameters,
      risk: "low",
    });
    expectCapabilityMetadata(feature, {
      name: "task.reopen",
      parameters,
      risk: "low",
    });
  });

  it("completes the selected opaque task at its pinned revision", async () => {
    const store = createTestTaskStore();
    const list = await store.addList({ name: "Shopping" });
    await store.addTask({ label: "Coffee", listId: list.id });
    const oatMilk = await store.addTask({
      label: "Oat milk",
      listId: list.id,
    });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.complete",
      { ordinal: 2, reference: "task-item-2" },
      {
        data: {
          completedAt: "2026-06-26T09:00:00.000Z",
          id: oatMilk.id,
          label: "Oat milk",
          listId: list.id,
          listName: "Shopping",
          revision: 2,
          status: "completed",
        },
        text: "Completed Oat milk on your Shopping list.",
      },
      taskReferenceContext({
        label: "Oat milk",
        listId: list.id,
        listName: "Shopping",
        ordinal: 2,
        revision: oatMilk.revision,
        taskId: oatMilk.id,
      }),
      "complete the second one",
    );
  });

  it("reopens a completed task without reactivating its reminder", async () => {
    const store = createTestTaskStore();
    const list = await store.addList({ name: "To-do" });
    const created = await store.addTask({
      label: "Submit the form",
      listId: list.id,
      reminderAt: "2026-07-29T08:00:00.000Z",
    });
    const completed = await store.updateTask({
      changes: { status: "completed" },
      expectedRevision: created.revision,
      id: created.id,
      updatedAt: "2026-06-26T09:00:00.000Z",
    });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.reopen",
      { id: created.id },
      {
        data: {
          id: created.id,
          label: "Submit the form",
          listId: list.id,
          listName: "To-do",
          reminderStatus: "cancelled",
          revision: 3,
          status: "open",
        },
        text: "Reopened Submit the form on your To-do list.",
      },
    );
    expect(completed?.reminder?.status).toBe("cancelled");
  });

  it("calculates label ambiguity only among eligible tasks", async () => {
    const store = createTestTaskStore();
    const list = await store.addList({ name: "Shopping" });
    const completed = await store.addTask({
      label: "Coffee",
      listId: list.id,
    });
    await store.updateTask({
      changes: { status: "completed" },
      expectedRevision: completed.revision,
      id: completed.id,
      updatedAt: "2026-06-26T09:00:00.000Z",
    });
    const open = await store.addTask({ label: "Coffee", listId: list.id });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.complete",
      { label: "coffee" },
      {
        data: {
          completedAt: "2026-06-26T09:00:00.000Z",
          id: open.id,
          label: "Coffee",
          listId: list.id,
          listName: "Shopping",
          revision: 2,
          status: "completed",
        },
        text: "Completed Coffee on your Shopping list.",
      },
    );
  });

  it("does not apply a retained reference after its task revision changes", async () => {
    const store = createTestTaskStore();
    const list = await store.addList({ name: "Shopping" });
    const task = await store.addTask({ label: "Coffee", listId: list.id });
    await store.updateTask({
      changes: { label: "Ground coffee" },
      expectedRevision: task.revision,
      id: task.id,
      updatedAt: "2026-06-26T09:00:00.000Z",
    });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.complete",
      { ordinal: 1 },
      {
        text: "That task changed after I showed it to you. Please show the list again.",
      },
      taskReferenceContext({
        label: "Coffee",
        listId: list.id,
        listName: "Shopping",
        ordinal: 1,
        revision: task.revision,
        taskId: task.id,
      }),
      "complete the first one",
    );
  });

  it("does not apply a retained reference after its list revision changes", async () => {
    const store = createTestTaskStore();
    const list = await store.addList({ name: "Shopping" });
    const task = await store.addTask({ label: "Coffee", listId: list.id });
    await store.renameList({
      expectedRevision: list.revision,
      id: list.id,
      name: "Groceries",
      updatedAt: "2026-06-26T09:00:00.000Z",
    });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.complete",
      { ordinal: 1 },
      {
        text: "That task changed after I showed it to you. Please show the list again.",
      },
      taskReferenceContext({
        label: "Coffee",
        listId: list.id,
        listName: "Shopping",
        ordinal: 1,
        revision: task.revision,
        taskId: task.id,
      }),
      "complete the first one",
    );
    expect((await store.listTasks())[0]?.status).toBe("open");
  });
});

describe("createTaskFeature task mutation capabilities", () => {
  it("keeps edits low risk and requires exact confirmation for removal", () => {
    const feature = createTaskFeature(createTestTaskStore());

    expectCapabilityMetadata(feature, {
      name: "task.edit",
      parameters: {
        clearDueDate: { type: "boolean" },
        clearNote: { type: "boolean" },
        id: { type: "string" },
        label: { type: "string" },
        listName: { type: "string" },
        newDueDate: { type: "string" },
        newLabel: { type: "string" },
        newNote: { type: "string" },
        ordinal: { type: "number" },
        reference: { type: "string" },
      },
      risk: "low",
    });
    expectCapabilityMetadata(feature, {
      name: "task.remove",
      parameters: {
        id: { type: "string" },
        label: { type: "string" },
        listName: { type: "string" },
        ordinal: { type: "number" },
        reference: { type: "string" },
      },
      requiresConfirmation: true,
      risk: "high",
    });
  });

  it("edits task fields without changing its completion fact", async () => {
    const store = createTestTaskStore();
    const list = await store.addList({ name: "To-do" });
    const created = await store.addTask({
      dueDate: "2026-07-30",
      label: "Submit form",
      listId: list.id,
      note: "Old note",
    });
    const completed = await store.updateTask({
      changes: { status: "completed" },
      expectedRevision: created.revision,
      id: created.id,
      updatedAt: "2026-06-26T09:00:00.000Z",
    });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.edit",
      {
        clearDueDate: true,
        clearNote: true,
        id: created.id,
        newLabel: "Submit the signed form",
      },
      {
        data: {
          completedAt: "2026-06-26T09:00:00.000Z",
          id: created.id,
          label: "Submit the signed form",
          listId: list.id,
          listName: "To-do",
          revision: 3,
          status: "completed",
        },
        text: "Updated Submit the signed form on your To-do list.",
      },
    );
    expect(completed?.completedAt).toBe("2026-06-26T09:00:00.000Z");
  });

  it("renders confirmed removal from safe retained facts", () => {
    const store = createTestTaskStore();
    const feature = createTaskFeature(store);
    const capability = feature.capabilities.find(
      ({ name }) => name === "task.remove",
    );
    const context = taskReferenceContext({
      label: "Oat milk",
      listId: "task-list-1",
      listName: "Shopping",
      ordinal: 2,
      revision: 1,
      taskId: "task-2",
    });

    expect(
      capability?.renderConfirmation?.(
        { ordinal: 2, reference: "task-item-2" },
        context,
      ),
    ).toEqual({
      facts: {
        label: "Oat milk",
        listName: "Shopping",
        ordinal: 2,
        reference: "task-item-2",
      },
      text: "remove Oat milk from the Shopping list",
    });
  });

  it("removes only the retained task revision after confirmation", async () => {
    const store = createTestTaskStore();
    const list = await store.addList({ name: "Shopping" });
    await store.addTask({ label: "Coffee", listId: list.id });
    const oatMilk = await store.addTask({
      label: "Oat milk",
      listId: list.id,
    });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.remove",
      { ordinal: 2, reference: "task-item-2" },
      {
        data: {
          id: oatMilk.id,
          label: "Oat milk",
          listId: list.id,
          listName: "Shopping",
          revision: 1,
          status: "open",
        },
        text: "Removed Oat milk from your Shopping list.",
      },
      taskReferenceContext({
        label: "Oat milk",
        listId: list.id,
        listName: "Shopping",
        ordinal: 2,
        revision: oatMilk.revision,
        taskId: oatMilk.id,
      }),
      "remove the second one",
    );
    expect((await store.listTasks()).map(({ label }) => label)).toEqual([
      "Coffee",
    ]);
  });

  it("does not remove a retained task after its list revision changes", async () => {
    const store = createTestTaskStore();
    const list = await store.addList({ name: "Shopping" });
    const task = await store.addTask({ label: "Coffee", listId: list.id });
    await store.renameList({
      expectedRevision: list.revision,
      id: list.id,
      name: "Groceries",
      updatedAt: "2026-06-26T09:00:00.000Z",
    });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.remove",
      { ordinal: 1, reference: "task-item-1" },
      {
        text: "That task changed after I showed it to you. Please show the list again.",
      },
      taskReferenceContext({
        label: "Coffee",
        listId: list.id,
        listName: "Shopping",
        ordinal: 1,
        revision: task.revision,
        taskId: task.id,
      }),
      "remove the first one",
    );
    expect(await store.listTasks()).toHaveLength(1);
  });

  it("rejects a removal confirmation without an exact human target", () => {
    const feature = createTaskFeature(createTestTaskStore());
    const capability = feature.capabilities.find(
      ({ name }) => name === "task.remove",
    );

    expect(() =>
      capability?.renderConfirmation?.(
        { id: "task-1" },
        createFeatureContext(),
      ),
    ).toThrow(
      "Task removal requires an exact retained reference or list and label.",
    );
  });
});

function taskReferenceContext(input: {
  label: string;
  listId: string;
  listName: string;
  listRevision?: number;
  ordinal: number;
  revision: number;
  taskId: string;
}): FeatureExecutionContext {
  return {
    ...createFeatureContext(),
    selectResultReference: ({ rawText }) =>
      rawText.includes(input.ordinal === 1 ? "first" : "second")
        ? {
            publicReference: {
              facts: {
                label: input.label,
                listName: input.listName,
                status: "open",
              },
              kind: "task_item",
              ordinal: input.ordinal,
              reference: `task-item-${input.ordinal}`,
            },
            target: {
              kind: "task_item",
              listId: input.listId,
              listRevision: input.listRevision ?? 1,
              revision: input.revision,
              taskId: input.taskId,
            },
          }
        : undefined,
    trustedInputText: `complete the ${
      input.ordinal === 1 ? "first" : "second"
    } one`,
  };
}
