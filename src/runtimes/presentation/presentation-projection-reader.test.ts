import { createProfilePresentationControl } from "../../application/profile-presentation-control.js";
import type { AlarmStore } from "../../ports/alarm-store.js";
import type { CalendarSearchPort } from "../../ports/calendar.js";
import type { ProfileStorePort } from "../../ports/profile-store.js";
import type { TaskStore } from "../../ports/task-store.js";
import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import {
  alarmStoreService,
  calendarSearchService,
  taskStoreService,
} from "../feature-source-services.js";
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
