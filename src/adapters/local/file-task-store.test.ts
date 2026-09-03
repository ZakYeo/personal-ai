import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createDurabilityUnknownStateFileSystem } from "../../test-support/local-json-state.js";

import {
  createFileTaskStore,
  type TaskStoreFileSystem,
} from "./file-task-store.js";

const initialTime = new Date("2026-07-28T09:00:00.000Z");

describe("createFileTaskStore", () => {
  it("returns a created list after reconciling a durability-unknown replacement", async () => {
    const createListId = vi.fn(() => "task-list-reconciled");
    const store = createFileTaskStore({
      createListId,
      filePath: "/state/tasks.json",
      fileSystem: createDurabilityUnknownStateFileSystem(),
      now: () => initialTime,
    });

    await expect(store.addList({ name: "To-do" })).resolves.toMatchObject({
      id: "task-list-reconciled",
      name: "To-do",
    });
    await expect(store.listLists()).resolves.toHaveLength(1);
    expect(createListId).toHaveBeenCalledTimes(1);
  });

  it("persists versioned task state across instances with restrictive modes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-tasks-"));
    const filePath = join(directory, "state", "tasks.json");
    const first = createFileTaskStore({
      createListId: () => "task-list-persisted",
      createTaskId: () => "task-persisted",
      filePath,
      now: () => initialTime,
    });
    const list = await first.addList({ name: "To-do" });
    const task = await first.addTask({
      label: "Submit the form",
      listId: list.id,
      reminderAt: "2026-07-29T08:00:00.000Z",
    });

    const second = createFileTaskStore({
      filePath,
      now: () => initialTime,
    });

    await expect(second.listLists()).resolves.toEqual([list]);
    await expect(second.listTasks()).resolves.toEqual([task]);
    await expect(readJson(filePath)).resolves.toEqual({
      version: 2,
      lists: [list],
      tasks: [task],
    });
    expect((await stat(dirname(filePath))).mode & 0o777).toBe(0o700);
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it("migrates version-one no-reminder state on the next mutation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-tasks-"));
    const filePath = join(directory, "tasks.json");
    const timestamp = initialTime.toISOString();
    const list = {
      createdAt: timestamp,
      id: "task-list-1",
      name: "To-do",
      revision: 1,
      updatedAt: timestamp,
    };
    const task = {
      createdAt: timestamp,
      id: "task-1",
      label: "Submit the form",
      listId: list.id,
      revision: 1,
      status: "open",
      updatedAt: timestamp,
    };
    await writeFile(
      filePath,
      JSON.stringify({ version: 1, lists: [list], tasks: [task] }),
    );
    const store = createFileTaskStore({
      filePath,
      now: () => initialTime,
    });

    await expect(store.listTasks()).resolves.toEqual([task]);
    await store.updateTask({
      changes: { label: "Submit the signed form" },
      expectedRevision: 1,
      id: task.id,
      updatedAt: "2026-07-28T10:00:00.000Z",
    });

    await expect(readJson(filePath)).resolves.toMatchObject({ version: 2 });
  });

  it.each([
    ["invalid JSON", "{not-json", "contains invalid JSON"],
    [
      "unsupported version",
      JSON.stringify({ version: 3, lists: [], tasks: [] }),
      "has an unsupported version",
    ],
    [
      "orphaned task state",
      JSON.stringify({
        version: 2,
        lists: [],
        tasks: [
          {
            createdAt: initialTime.toISOString(),
            id: "task-1",
            label: "Orphan",
            listId: "missing",
            revision: 1,
            status: "open",
            updatedAt: initialTime.toISOString(),
          },
        ],
      }),
      "references a missing task list",
    ],
  ])("rejects %s", async (_label, contents, message) => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-tasks-"));
    const filePath = join(directory, "tasks.json");
    await writeFile(filePath, contents);
    const store = createFileTaskStore({
      filePath,
      now: () => initialTime,
    });

    await expect(store.listTasks()).rejects.toThrow(message);
  });

  it("serializes competing revision updates against persisted state", async () => {
    const store = createFileTaskStore({
      createListId: () => "task-list-1",
      createTaskId: () => "task-1",
      filePath: "/state/tasks.json",
      fileSystem: createMemoryFileSystem(),
      now: () => initialTime,
    });
    const list = await store.addList({ name: "To-do" });
    const task = await store.addTask({
      label: "Submit the form",
      listId: list.id,
    });

    const [completed, edited] = await Promise.all([
      store.updateTask({
        changes: { status: "completed" },
        expectedRevision: task.revision,
        id: task.id,
        updatedAt: "2026-07-28T10:00:00.000Z",
      }),
      store.updateTask({
        changes: { label: "Stale edit" },
        expectedRevision: task.revision,
        id: task.id,
        updatedAt: "2026-07-28T10:01:00.000Z",
      }),
    ]);

    expect(completed).toMatchObject({ revision: 2, status: "completed" });
    expect(edited).toBeUndefined();
    await expect(store.listTasks()).resolves.toEqual([completed]);
  });

  it("atomically persists an exact revision-pinned list clear", async () => {
    const fileSystem = createMemoryFileSystem();
    const store = createFileTaskStore({
      createListId: () => "task-list-1",
      createTaskId: (() => {
        let next = 0;
        return () => `task-${++next}`;
      })(),
      filePath: "/state/tasks.json",
      fileSystem,
      now: () => initialTime,
    });
    const list = await store.addList({ name: "To-do" });
    const first = await store.addTask({
      label: "Submit form",
      listId: list.id,
    });
    const second = await store.addTask({
      label: "Book train",
      listId: list.id,
    });

    const cleared = await store.clearList({
      expectedListRevision: list.revision,
      listId: list.id,
      tasks: [
        { id: first.id, revision: first.revision },
        { id: second.id, revision: second.revision },
      ],
    });

    expect(cleared).toMatchObject({
      list,
      removed: [first, second],
    });
    await expect(store.listTasks()).resolves.toEqual([]);
  });

  it("persists mutations before reporting success", async () => {
    let persisted = false;
    const store = createFileTaskStore({
      createListId: () => "task-list-1",
      filePath: "/state/tasks.json",
      fileSystem: createMemoryFileSystem({
        replaceFile: () => {
          persisted = true;
          return Promise.resolve();
        },
      }),
      now: () => initialTime,
    });

    await store.addList({ name: "To-do" });

    expect(persisted).toBe(true);
  });

  it("does not expose mutable persisted reminder state", async () => {
    const store = createFileTaskStore({
      createListId: () => "task-list-1",
      createTaskId: () => "task-1",
      filePath: "/state/tasks.json",
      fileSystem: createMemoryFileSystem(),
      now: () => initialTime,
    });
    const list = await store.addList({ name: "To-do" });
    const task = await store.addTask({
      label: "Submit the form",
      listId: list.id,
      reminderAt: "2026-07-29T08:00:00.000Z",
    });
    if (!task.reminder) throw new Error("Expected a reminder.");
    task.reminder.scheduledFor = "2026-07-30T08:00:00.000Z";

    await expect(store.listTasks()).resolves.toMatchObject([
      {
        reminder: { scheduledFor: "2026-07-29T08:00:00.000Z" },
      },
    ]);
  });
});

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function createMemoryFileSystem(
  overrides: Partial<TaskStoreFileSystem> = {},
): TaskStoreFileSystem {
  let contents: string | undefined;
  return {
    mkdir: () => Promise.resolve(),
    readFile: () =>
      contents === undefined
        ? Promise.reject(
            Object.assign(new Error("missing"), { code: "ENOENT" }),
          )
        : Promise.resolve(contents),
    replaceFile: async (options) => {
      contents = options.contents;
      await overrides.replaceFile?.(options);
    },
  };
}
