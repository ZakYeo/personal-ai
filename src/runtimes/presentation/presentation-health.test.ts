import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import {
  calendarSearchService,
  taskStoreService,
} from "../feature-source-services.js";
import {
  bindRuntimeService,
  createRuntimeServiceRegistry,
} from "../runtime-service-registry.js";
import { readPresentationProjection } from "./presentation-projection-reader.js";

describe("presentation integration health", () => {
  it("distinguishes configuration, successful reads, failures, and missing checks", async () => {
    const failure = new Error("private provider failure");
    const reportFailure = vi.fn();
    const projection = await readPresentationProjection({
      config: createLoadedRuntimeConfig({
        calendar: { adapter: "mock", enabled: true },
        tasks: { adapter: "local", enabled: true },
        alarms: { adapter: "local", enabled: true },
        profile: { adapter: "local", enabled: false },
        messaging: { adapter: "mock", enabled: true },
      }),
      now: new Date("2026-09-04T10:00:00Z"),
      reportFailure,
      projectProfile: () => [],
      services: createRuntimeServiceRegistry([
        bindRuntimeService(calendarSearchService, {
          getEvent: vi.fn(),
          searchEvents: () => Promise.resolve([]),
        }),
        bindRuntimeService(taskStoreService, {
          acknowledgeReminder: vi.fn(),
          addList: vi.fn(),
          addTask: vi.fn(),
          claimReminder: vi.fn(),
          clearList: vi.fn(),
          clearTerminalRemindersBefore: vi.fn(),
          listLists: vi.fn(),
          listTasks: () => Promise.reject(failure),
          markReminderDelivered: vi.fn(),
          removeTask: vi.fn(),
          renameList: vi.fn(),
          updateTask: vi.fn(),
        }),
      ]),
    });
    expect(projection.integrations).toEqual(
      expect.arrayContaining([
        { label: "Calendar", status: "connected", lastCheck: "4 Sept, 11:00" },
        { label: "Tasks", status: "degraded", lastCheck: "4 Sept, 11:00" },
        { label: "Alarms", status: "unchecked", lastCheck: "Not checked" },
        { label: "Profile", status: "disabled", lastCheck: "Not checked" },
        { label: "Messaging", status: "configured", lastCheck: "Not checked" },
      ]),
    );
    expect(reportFailure).toHaveBeenCalledWith(failure);
    expect(JSON.stringify(projection)).not.toContain("private provider");
  });
});
