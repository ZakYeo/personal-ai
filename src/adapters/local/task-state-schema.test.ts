import {
  assertValidTaskStateDocument,
  parseTaskState,
} from "./task-state-schema.js";

const timestamp = "2026-07-28T09:00:00.000Z";
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
  status: "open" as const,
  updatedAt: timestamp,
};

describe("task state schema", () => {
  it("migrates version-one state without inventing reminder data", () => {
    expect(
      parseTaskState({ version: 1, lists: [list], tasks: [task] }),
    ).toEqual({
      version: 2,
      lists: [list],
      tasks: [task],
    });
  });

  it("parses current reminder lifecycle state field by field", () => {
    const state = parseTaskState({
      version: 2,
      lists: [list],
      tasks: [
        {
          ...task,
          reminder: {
            scheduledFor: "2026-07-29T08:00:00.000Z",
            status: "scheduled",
          },
        },
      ],
    });

    expect(state.tasks[0]?.reminder).toEqual({
      scheduledFor: "2026-07-29T08:00:00.000Z",
      status: "scheduled",
    });
  });

  it.each([
    ["a reminder in version one", 1, { ...task, reminder: {} }],
    ["an unknown task status", 2, { ...task, status: "pending" }],
    ["a malformed reminder", 2, { ...task, reminder: { status: "scheduled" } }],
    [
      "contradictory reminder lifecycle fields",
      2,
      {
        ...task,
        reminder: {
          claimedAt: "2026-07-29T08:01:00.000Z",
          scheduledFor: "2026-07-29T08:00:00.000Z",
          status: "scheduled",
        },
      },
    ],
  ])("rejects %s", (_label, version, invalidTask) => {
    expect(() =>
      parseTaskState({ version, lists: [list], tasks: [invalidTask] }),
    ).toThrow("contains invalid task state");
  });

  it("rejects duplicate IDs, duplicate normalized names, and orphaned tasks", () => {
    expect(() =>
      assertValidTaskStateDocument({
        version: 2,
        lists: [list, { ...list }],
        tasks: [],
      }),
    ).toThrow("duplicate task list IDs");
    expect(() =>
      assertValidTaskStateDocument({
        version: 2,
        lists: [list, { ...list, id: "task-list-2", name: "TO-DO" }],
        tasks: [],
      }),
    ).toThrow("duplicate task list names");
    expect(() =>
      assertValidTaskStateDocument({
        version: 2,
        lists: [list],
        tasks: [{ ...task, listId: "missing-list" }],
      }),
    ).toThrow("references a missing task list");
  });

  it("rejects unsupported versions and non-record external data", () => {
    expect(() => parseTaskState({ version: 3, lists: [], tasks: [] })).toThrow(
      "has an unsupported version",
    );
    expect(() => parseTaskState([])).toThrow("has an unsupported version");
  });
});
