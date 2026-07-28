import {
  createFeatureContext,
  expectCapabilityMetadata,
  expectDecodedFeatureExecution,
} from "../../test-support/feature-contract.js";
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
        expectsFollowUp: true,
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
