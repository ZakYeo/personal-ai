import { attentionCandidateKey } from "../../application/attention-candidate.js";
import {
  createTestAttentionStore,
  createTestAttentionRule,
  createTestAttentionItem,
} from "../../test-support/attention.js";
import {
  attentionStoreService,
  alarmStoreService,
  calendarSearchService,
  taskStoreService,
} from "../feature-source-services.js";
import { createProfilePresentationControl } from "../../application/profile-presentation-control.js";
import type { AlarmStore } from "../../ports/alarm-store.js";
import type { CalendarSearchPort } from "../../ports/calendar.js";
import type { ProfileStorePort } from "../../ports/profile-store.js";
import type { TaskStore } from "../../ports/task-store.js";
import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import { profileStoreService } from "../profile-runtime-services.js";
import {
  bindRuntimeService,
  createRuntimeServiceRegistry,
} from "../runtime-service-registry.js";
import { readPresentationProjection } from "./presentation-projection-reader.js";

describe("presentation projection reader", () => {
  it("filters Today by the configured local day and labels other work separately", async () => {
    const alarms = alarmStore();
    const baseAlarm = (await alarms.list())[0]!;
    alarms.list = () =>
      Promise.resolve([
        {
          ...baseAlarm,
          id: "today",
          label: "Local today",
          scheduledFor: "2026-09-04T23:30:00Z",
        },
        {
          ...baseAlarm,
          id: "yesterday",
          label: "Yesterday",
          scheduledFor: "2026-09-04T22:30:00Z",
        },
        {
          ...baseAlarm,
          id: "tomorrow",
          label: "Tomorrow",
          scheduledFor: "2026-09-05T23:30:00Z",
        },
      ]);
    const tasks = taskStore();
    const baseTask = (await tasks.listTasks())[0]!;
    delete baseTask.dueDate;
    tasks.listTasks = () =>
      Promise.resolve([
        { ...baseTask, id: "due", label: "Due today", dueDate: "2026-09-05" },
        {
          ...baseTask,
          id: "overdue",
          label: "Old task",
          dueDate: "2026-09-04",
        },
        {
          ...baseTask,
          id: "future",
          label: "Future task",
          dueDate: "2026-09-06",
        },
        {
          ...baseTask,
          id: "undated",
          label: "Undated task",
        },
        {
          ...baseTask,
          id: "done",
          label: "Done task",
          dueDate: "2026-09-05",
          status: "completed",
        },
      ]);
    const events = calendar();
    const searchEvents = vi.fn().mockResolvedValue([
      {
        id: "1",
        title: "Late UTC event",
        startAt: "2026-09-04T23:30:00Z",
        startDate: "2026-09-04",
        startTime: "23:30",
      },
      { id: "2", title: "All day today", startDate: "2026-09-05" },
      { id: "3", title: "Outside local day", startDate: "2026-09-04" },
    ]);
    events.searchEvents = searchEvents;
    const projection = await readPresentationProjection({
      config: createLoadedRuntimeConfig({}),
      now: new Date("2026-09-04T23:45:00Z"),
      projectProfile: () => [],
      reportFailure: vi.fn(),
      services: createRuntimeServiceRegistry([
        bindRuntimeService(alarmStoreService, alarms),
        bindRuntimeService(taskStoreService, tasks),
        bindRuntimeService(calendarSearchService, events),
      ]),
    });
    expect(projection.today).toEqual([
      "5 Sept, 0:30 · Late UTC event",
      "All day · All day today",
      "5 Sept, 0:30 · Local today",
      "Due today",
    ]);
    expect(projection.tasks.map((task) => task.status)).toEqual([
      "open · due today",
      "open · overdue · due 4 Sept",
      "open · future · due 6 Sept",
      "open · undated",
      "completed · due 5 Sept",
    ]);
    expect(searchEvents).toHaveBeenCalledWith(
      { localDay: { date: "2026-09-05", timeZone: "Europe/London" } },
      { now: new Date("2026-09-04T23:45:00Z") },
    );
  });
  it("projects narrow safe feature state with natural human dates", async () => {
    const projection = await readPresentationProjection({
      config: createLoadedRuntimeConfig({
        alarms: { adapter: "local", enabled: true },
        calendar: { adapter: "mock", enabled: true },
        profile: { adapter: "local", enabled: true },
        tasks: { adapter: "local", enabled: true },
      }),
      now: new Date("2026-09-04T09:00:00.000Z"),
      reportFailure: vi.fn(),
      projectProfile: createProfilePresentationControl({
        referencePrefix: "test",
        store: profileStore(),
        now: () => new Date("2026-09-04T09:00:00Z"),
      }).project,
      services: createRuntimeServiceRegistry([
        bindRuntimeService(alarmStoreService, alarmStore()),
        bindRuntimeService(calendarSearchService, calendar()),
        bindRuntimeService(profileStoreService, profileStore()),
        bindRuntimeService(taskStoreService, taskStore()),
      ]),
    });

    expect(projection).toMatchObject({
      alarms: [{ label: "Tea", scheduledFor: "4 Sept, 11:00" }],
      profile: [{ field: "preferredName", value: "Zak" }],
      tasks: [{ label: "Review notes", status: "open · due today" }],
    });
    expect(projection.today).toEqual(
      expect.arrayContaining([
        "4 Sept, 11:00 · Planning",
        "4 Sept, 11:00 · Tea",
        "Review notes",
      ]),
    );
    expect(JSON.stringify(projection)).not.toContain("2026-09-04T");
  });
});

function alarmStore(): AlarmStore {
  return {
    add: vi.fn(),
    list: () =>
      Promise.resolve([
        {
          createdAt: "2026-09-01T09:00:00.000Z",
          deliveryAttempts: 0,
          id: "alarm-1",
          label: "Tea",
          nextDeliveryAt: "2026-09-04T10:00:00.000Z",
          revision: 1,
          scheduledFor: "2026-09-04T10:00:00.000Z",
          status: "scheduled",
          successfulDeliveries: 0,
          updatedAt: "2026-09-01T09:00:00.000Z",
        },
      ]),
    removeTerminalBefore: vi.fn(),
    update: vi.fn(),
  };
}

function calendar(): CalendarSearchPort {
  return {
    getEvent: vi.fn(),
    searchEvents: () =>
      Promise.resolve([
        {
          id: "event-1",
          startAt: "2026-09-04T10:00:00.000Z",
          startDate: "2026-09-04",
          startTime: "11:00",
          title: "Planning",
        },
      ]),
  };
}

function profileStore(): ProfileStorePort {
  return {
    clear: vi.fn(),
    forget: vi.fn(),
    list: () =>
      Promise.resolve([
        {
          createdAt: "2026-09-01T09:00:00.000Z",
          field: "preferredName",
          provenance: "user-authored",
          updatedAt: "2026-09-01T09:00:00.000Z",
          value: "Zak",
        },
      ]),
    set: vi.fn(),
  };
}

function taskStore(): TaskStore {
  return {
    acknowledgeReminder: vi.fn(),
    addList: vi.fn(),
    addTask: vi.fn(),
    claimReminder: vi.fn(),
    clearList: vi.fn(),
    clearTerminalRemindersBefore: vi.fn(),
    listLists: vi.fn(),
    listTasks: () =>
      Promise.resolve([
        {
          createdAt: "2026-09-01T09:00:00.000Z",
          dueDate: "2026-09-04",
          id: "task-1",
          label: "Review notes",
          listId: "list-1",
          revision: 1,
          status: "open",
          updatedAt: "2026-09-01T09:00:00.000Z",
        },
      ]),
    markReminderDelivered: vi.fn(),
    removeTask: vi.fn(),
    renameList: vi.fn(),
    updateTask: vi.fn(),
  };
}

it("projects durable attention notices with opaque controls and no internal target facts", async () => {
  const store = createTestAttentionStore({ timeZone: "Europe/London" });
  const state = await store.read();
  await store.replace(state.revision, {
    ...state,
    revision: state.revision + 1,
    rules: [createTestAttentionRule()],
    inbox: [createTestAttentionItem()],
  });
  const projection = await readPresentationProjection({
    config: createLoadedRuntimeConfig({}),
    now: new Date("2026-09-07T12:00:00.000Z"),
    services: createRuntimeServiceRegistry([
      bindRuntimeService(attentionStoreService, store),
    ]),
    projectProfile: () => [],
    reportFailure: () => {},
  });
  expect(projection.attention).toMatchObject([
    {
      id: "attention-item-2",
      revision: 1,
      delivery: "unknown",
      status: "open",
    },
  ]);
  expect(projection.attention[0]).not.toHaveProperty("facts");
  expect(projection.attention[0]?.text).toContain(
    "Recorded at 1pm on 7 September 2026, London time:",
  );
});

it.each([
  "claimed",
  "acknowledged",
  "delivered",
  "missing",
  "unavailable",
] as const)(
  "projects the current %s reminder state without changing notice delivery",
  async (status) => {
    const store = createTestAttentionStore({ timeZone: "Europe/London" });
    const state = await store.read();
    const rule = {
      ...createTestAttentionRule(),
      definition: { kind: "runtime_health" as const },
    };
    const item = {
      ...createTestAttentionItem(rule),
      key: attentionCandidateKey(
        rule.definition,
        "reminder:task-1:2026-09-07T11:00:00.000Z",
      ),
      facts: { problem: "reminder_delivery_unknown" },
    };
    await store.replace(state.revision, {
      ...state,
      revision: state.revision + 1,
      rules: [rule],
      inbox: [item],
    });
    const tasks = taskStore();
    const original = (await tasks.listTasks())[0]!;
    tasks.listTasks = () => {
      if (status === "unavailable")
        return Promise.reject(new Error("private task-store failure"));
      if (status === "missing") return Promise.resolve([]);
      const baseReminder = {
        claimedAt: "2026-09-07T11:00:00.000Z",
        scheduledFor: "2026-09-07T11:00:00.000Z",
      };
      const reminder =
        status === "acknowledged"
          ? {
              ...baseReminder,
              status,
              acknowledgedAt: "2026-09-07T11:30:00.000Z",
            }
          : status === "delivered"
            ? {
                ...baseReminder,
                status,
                deliveredAt: "2026-09-07T11:30:00.000Z",
              }
            : { ...baseReminder, status };
      return Promise.resolve([{ ...original, reminder }]);
    };
    const diagnostics = vi.fn();
    const projection = await readPresentationProjection({
      config: createLoadedRuntimeConfig({}),
      now: new Date("2026-09-08T12:00:00.000Z"),
      services: createRuntimeServiceRegistry([
        bindRuntimeService(attentionStoreService, store),
        bindRuntimeService(taskStoreService, tasks),
      ]),
      projectProfile: () => [],
      reportFailure: diagnostics,
    });
    expect(projection.attention[0]?.canResolveReminder).toBe(
      status === "claimed" || status === "delivered",
    );
    expect(projection.attention[0]?.delivery).toBe("unknown");
    expect(projection.attention[0]?.status).toBe("open");
    const descriptions = {
      claimed: "Current reminder delivery remains unknown.",
      acknowledged: "already been acknowledged",
      delivered: "now records completed delivery",
      missing: "no longer current",
      unavailable: "Current reminder state is unavailable.",
    };
    expect(projection.attention[0]?.text).toContain(descriptions[status]);
    expect(diagnostics).toHaveBeenCalledTimes(status === "unavailable" ? 1 : 0);
    expect(JSON.stringify(projection.attention)).not.toContain("private");
    expect((await store.read()).inbox[0]).toEqual(item);
  },
);
