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
      tasks: [{ label: "Review notes", status: "open · due 4 Sept" }],
    });
    expect(projection.today).toEqual(
      expect.arrayContaining([
        "11:00 · Planning",
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
