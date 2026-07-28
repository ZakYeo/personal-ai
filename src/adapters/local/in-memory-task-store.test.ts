import { describe, expect, it } from "vitest";

import { createInMemoryTaskStore } from "./in-memory-task-store.js";

const initialTime = new Date("2026-07-28T09:00:00.000Z");

function createStore() {
  let nextListId = 0;
  let nextTaskId = 0;
  let now = initialTime;
  return {
    advanceTo(value: string) {
      now = new Date(value);
    },
    store: createInMemoryTaskStore({
      createListId: () => `task-list-${++nextListId}`,
      createTaskId: () => `task-${++nextTaskId}`,
      now: () => now,
    }),
  };
}

describe("in-memory task store lists", () => {
  it("creates and lists canonical named lists", async () => {
    const { store } = createStore();

    const created = await store.addList({ name: "Shopping" });

    expect(created).toEqual({
      createdAt: initialTime.toISOString(),
      id: "task-list-1",
      name: "Shopping",
      revision: 1,
      updatedAt: initialTime.toISOString(),
    });
    expect(await store.listLists()).toEqual([created]);
  });

  it("rejects duplicate names using user-facing matching semantics", async () => {
    const { store } = createStore();
    await store.addList({ name: "Shopping" });

    await expect(store.addList({ name: "  shopping  " })).rejects.toThrow(
      'A task list named "shopping" already exists.',
    );
  });

  it("bounds the number of retained lists", async () => {
    const { store } = createStore();
    for (let index = 1; index <= 100; index += 1) {
      await store.addList({ name: `List ${index}` });
    }

    await expect(store.addList({ name: "One too many" })).rejects.toThrow(
      "Task state cannot contain more than 100 lists.",
    );
    expect(await store.listLists()).toHaveLength(100);
  });

  it("renames a list with a revision-checked update", async () => {
    const fixture = createStore();
    const created = await fixture.store.addList({ name: "Errands" });
    fixture.advanceTo("2026-07-28T09:05:00.000Z");

    const renamed = await fixture.store.renameList({
      expectedRevision: created.revision,
      id: created.id,
      name: "Weekend errands",
      updatedAt: "2026-07-28T09:05:00.000Z",
    });

    expect(renamed).toMatchObject({
      id: created.id,
      name: "Weekend errands",
      revision: 2,
      updatedAt: "2026-07-28T09:05:00.000Z",
    });
    await expect(
      fixture.store.renameList({
        expectedRevision: 1,
        id: created.id,
        name: "Stale overwrite",
        updatedAt: "2026-07-28T09:06:00.000Z",
      }),
    ).resolves.toBeUndefined();
    expect((await fixture.store.listLists())[0]?.name).toBe("Weekend errands");
  });

  it("rejects rename collisions without changing either list", async () => {
    const { store } = createStore();
    const errands = await store.addList({ name: "Errands" });
    await store.addList({ name: "Shopping" });

    await expect(
      store.renameList({
        expectedRevision: errands.revision,
        id: errands.id,
        name: " SHOPPING ",
        updatedAt: "2026-07-28T09:05:00.000Z",
      }),
    ).rejects.toThrow('A task list named "SHOPPING" already exists.');

    expect((await store.listLists()).map(({ name }) => name)).toEqual([
      "Errands",
      "Shopping",
    ]);
  });

  it("does not expose mutable list state to callers", async () => {
    const { store } = createStore();
    const created = await store.addList({ name: "Shopping" });
    created.name = "Mutated";
    const listed = await store.listLists();
    if (!listed[0]) throw new Error("Expected a list.");
    listed[0].name = "Also mutated";

    expect(await store.listLists()).toMatchObject([{ name: "Shopping" }]);
  });

  it("rejects an update timestamp before the current revision", async () => {
    const { store } = createStore();
    const created = await store.addList({ name: "Shopping" });

    await expect(
      store.renameList({
        expectedRevision: created.revision,
        id: created.id,
        name: "Groceries",
        updatedAt: "2026-07-28T08:59:59.000Z",
      }),
    ).rejects.toThrow("Task list state is invalid.");
  });
});

describe("in-memory task store task creation", () => {
  it("creates a task with optional exact fields and a scheduled reminder", async () => {
    const { store } = createStore();
    const list = await store.addList({ name: "To-do" });

    const created = await store.addTask({
      dueDate: "2026-07-29",
      label: "Submit the form",
      listId: list.id,
      note: "Use the signed copy",
      reminderAt: "2026-07-29T08:00:00.000Z",
    });

    expect(created).toEqual({
      createdAt: initialTime.toISOString(),
      dueDate: "2026-07-29",
      id: "task-1",
      label: "Submit the form",
      listId: list.id,
      note: "Use the signed copy",
      reminder: {
        scheduledFor: "2026-07-29T08:00:00.000Z",
        status: "scheduled",
      },
      revision: 1,
      status: "open",
      updatedAt: initialTime.toISOString(),
    });
    expect(await store.listTasks()).toEqual([created]);
  });

  it("normalizes user-authored task text at the store boundary", async () => {
    const { store } = createStore();
    const list = await store.addList({ name: "To-do" });

    const created = await store.addTask({
      label: "  Submit   the form  ",
      listId: list.id,
      note: "  Use the signed copy  ",
    });

    expect(created).toMatchObject({
      label: "Submit the form",
      note: "Use the signed copy",
    });
  });

  it("rejects a task for an unknown list", async () => {
    const { store } = createStore();

    await expect(
      store.addTask({
        label: "Submit the form",
        listId: "missing-list",
      }),
    ).rejects.toThrow("Task list missing-list does not exist.");
    expect(await store.listTasks()).toEqual([]);
  });

  it("rejects a reminder that is not strictly in the future", async () => {
    const { store } = createStore();
    const list = await store.addList({ name: "To-do" });

    await expect(
      store.addTask({
        label: "Submit the form",
        listId: list.id,
        reminderAt: initialTime.toISOString(),
      }),
    ).rejects.toThrow("A new task reminder must be in the future.");
  });

  it("does not expose mutable reminder state to callers", async () => {
    const { store } = createStore();
    const list = await store.addList({ name: "To-do" });
    const created = await store.addTask({
      label: "Submit the form",
      listId: list.id,
      reminderAt: "2026-07-29T08:00:00.000Z",
    });
    if (!created.reminder) throw new Error("Expected a reminder.");
    created.reminder.scheduledFor = "2026-07-30T08:00:00.000Z";

    expect((await store.listTasks())[0]?.reminder).toEqual({
      scheduledFor: "2026-07-29T08:00:00.000Z",
      status: "scheduled",
    });
  });

  it("bounds retained task state", async () => {
    const { store } = createStore();
    const list = await store.addList({ name: "To-do" });
    for (let index = 1; index <= 1_000; index += 1) {
      await store.addTask({ label: `Task ${index}`, listId: list.id });
    }

    await expect(
      store.addTask({ label: "One too many", listId: list.id }),
    ).rejects.toThrow("Task state cannot contain more than 1000 tasks.");
    expect(await store.listTasks()).toHaveLength(1_000);
  });
});
