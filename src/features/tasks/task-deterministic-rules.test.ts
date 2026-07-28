import { getDeterministicFeatureRules } from "../../ports/deterministic-feature-rules.js";
import { createTestTaskStore } from "../../test-support/task-store.js";
import { createTaskFeature } from "./task-feature.js";

describe("task deterministic intent rules", () => {
  it.each([
    ["create a shopping list", "task.list.create", { name: "shopping" }],
    ["show my lists", "task.list.show", {}],
    ["show my shopping list", "task.list.show", { name: "shopping" }],
    [
      "rename my shopping list to groceries",
      "task.list.rename",
      { name: "shopping", newName: "groceries" },
    ],
    ["clear my groceries list", "task.list.clear", { listName: "groceries" }],
    [
      "add oat milk to my shopping list",
      "task.create",
      { label: "oat milk", listName: "shopping" },
    ],
    [
      "remind me at 2026-07-29t08:00:00.000z to submit the form on my to-do list",
      "task.remind",
      {
        label: "submit the form",
        listName: "to-do",
        reminderAt: "2026-07-29T08:00:00.000Z",
      },
    ],
    [
      "complete oat milk on my shopping list",
      "task.complete",
      { label: "oat milk", listName: "shopping" },
    ],
    [
      "reopen oat milk on my shopping list",
      "task.reopen",
      { label: "oat milk", listName: "shopping" },
    ],
    [
      "rename oat milk on my shopping list to barista oat milk",
      "task.edit",
      {
        label: "oat milk",
        listName: "shopping",
        newLabel: "barista oat milk",
      },
    ],
    [
      "remove oat milk from my shopping list",
      "task.remove",
      { label: "oat milk", listName: "shopping" },
    ],
    [
      "acknowledge the reminder for submit the form on my to-do list",
      "task.reminder.acknowledge",
      { label: "submit the form", listName: "to-do" },
    ],
    ["complete the second one", "task.complete", { ordinal: 2 }],
  ])("routes %s only to %s", (text, capability, parameters) => {
    const rules = getDeterministicFeatureRules(
      createTaskFeature(createTestTaskStore()),
    );
    const matches = rules.flatMap((rule) => {
      const match = rule.match(text);
      return match ? [{ capability: rule.capability, parameters: match }] : [];
    });

    expect(matches).toEqual([{ capability, parameters }]);
  });
});
