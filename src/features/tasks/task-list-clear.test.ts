import {
  createFeatureContext,
  expectCapabilityMetadata,
  expectDecodedFeatureExecution,
} from "../../test-support/feature-contract.js";
import { createTestTaskStore } from "../../test-support/task-store.js";
import { createTaskFeature } from "./task-feature.js";

describe("task list clearing", () => {
  it("declares a high-risk exact-list capability", () => {
    expectCapabilityMetadata(createTaskFeature(createTestTaskStore()), {
      name: "task.list.clear",
      parameters: {
        listName: { required: true, type: "string" },
      },
      requiresConfirmation: true,
      risk: "high",
    });
  });

  it("renders the exact normalized affected list for confirmation", () => {
    const capability = createTaskFeature(
      createTestTaskStore(),
    ).capabilities.find(({ name }) => name === "task.list.clear");

    expect(
      capability?.renderConfirmation?.(
        { listName: "  Weekend   errands  " },
        createFeatureContext(),
      ),
    ).toEqual({
      facts: { listName: "Weekend errands" },
      text: "clear every task from the Weekend errands list",
    });
  });

  it("clears only the exact selected list and reports protected facts", async () => {
    const store = createTestTaskStore();
    const shopping = await store.addList({ name: "Shopping" });
    const work = await store.addList({ name: "Work" });
    await store.addTask({ label: "Coffee", listId: shopping.id });
    await store.addTask({ label: "Oat milk", listId: shopping.id });
    await store.addTask({ label: "Submit report", listId: work.id });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.list.clear",
      { listName: "shopping" },
      {
        data: {
          listId: shopping.id,
          listName: "Shopping",
          removedCount: 2,
        },
        text: "Cleared 2 tasks from your Shopping list.",
      },
    );

    await expect(store.listTasks()).resolves.toMatchObject([
      { label: "Submit report", listId: work.id },
    ]);
  });

  it("does not mutate an already empty list", async () => {
    const store = createTestTaskStore();
    const list = await store.addList({ name: "Shopping" });

    await expectDecodedFeatureExecution(
      createTaskFeature(store),
      "task.list.clear",
      { listName: "Shopping" },
      {
        data: {
          listId: list.id,
          listName: "Shopping",
          removedCount: 0,
        },
        text: "Your Shopping list is already empty.",
      },
    );
  });
});
