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
    ["a non-canonical list name", [{ ...list, name: "To-  do" }], [task]],
    [
      "a non-canonical task label",
      [list],
      [{ ...task, label: "Submit  form" }],
    ],
    ["a non-canonical task note", [list], [{ ...task, note: " Check it" }]],
  ])("rejects %s", (_label, lists, tasks) => {
    expect(() => parseTaskState({ version: 2, lists, tasks })).toThrow(
      /contains invalid task (?:list )?state/u,
    );
  });

  it.each([
    {
      scheduledFor: "2026-07-28T08:00:00.000Z",
      status: "scheduled" as const,
    },
    {
      claimedAt: "2026-07-28T08:00:00.000Z",
      scheduledFor: "2026-07-28T07:59:00.000Z",
      status: "claimed" as const,
    },
    {
      claimedAt: "2026-07-28T07:50:00.000Z",
      deliveredAt: "2026-07-28T08:00:00.000Z",
      scheduledFor: "2026-07-28T07:40:00.000Z",
      status: "delivered" as const,
    },
    {
      acknowledgedAt: "2026-07-28T08:00:00.000Z",
      claimedAt: "2026-07-28T07:40:00.000Z",
      deliveredAt: "2026-07-28T07:50:00.000Z",
      scheduledFor: "2026-07-28T07:30:00.000Z",
      status: "acknowledged" as const,
    },
    {
      cancelledAt: "2026-07-28T08:00:00.000Z",
      scheduledFor: "2026-07-29T08:00:00.000Z",
      status: "cancelled" as const,
    },
  ])("rejects $status reminder history before task creation", (reminder) => {
    expect(() =>
      parseTaskState({
        version: 2,
        lists: [list],
        tasks: [{ ...task, reminder }],
      }),
    ).toThrow("contains invalid task state");
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
