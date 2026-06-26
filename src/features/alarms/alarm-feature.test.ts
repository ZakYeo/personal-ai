import { createAlarmFeature } from "./alarm-feature.js";
import type { AlarmRecord, AlarmStore } from "../../ports/alarm-store.js";
import {
  createFeatureCommand,
  createFeatureExecutionRequest,
  createFeatureContext,
  createTypedFeatureCommand,
  expectCapabilityMetadata,
  expectFeatureExecution,
  expectFeatureHandles,
} from "../../test-support/feature-contract.js";

const context = createFeatureContext();

describe("createAlarmFeature", () => {
  it("declares alarm capability metadata", () => {
    const feature = createAlarmFeature(createTestAlarmStore());

    expectCapabilityMetadata(feature, {
      name: "alarm.create",
      risk: "high",
      requiresConfirmation: false,
      parameters: {
        label: { type: "string" },
        minutesFromNow: { type: "number", required: true, positive: true },
      },
    });
    expectCapabilityMetadata(feature, {
      name: "alarm.list",
      risk: "low",
      parameters: {},
    });
  });

  it("handles alarm create and list commands", () => {
    const feature = createAlarmFeature(createTestAlarmStore());

    expectFeatureHandles(feature, "alarm.create", "calendar.search_events");
    expectFeatureHandles(feature, "alarm.list", "calendar.search_events");
  });

  it("creates deterministic alarms using the injected clock", async () => {
    await expectFeatureExecution(
      createAlarmFeature(createTestAlarmStore()),
      createFeatureCommand("alarm.create", {
        label: "ping me",
        minutesFromNow: 10,
      }),
      {
        label: "ping me",
        minutesFromNow: 10,
      },
      {
        text: "Alarm set for 2026-06-26T09:10:00.000Z (ping me).",
        data: {
          id: "alarm-1",
          label: "ping me",
          scheduledFor: "2026-06-26T09:10:00.000Z",
        },
      },
      context,
    );
  });

  it("lists alarms from the in-memory store", async () => {
    const feature = createAlarmFeature(createTestAlarmStore());

    await feature.execute(
      createFeatureExecutionRequest(
        createTypedFeatureCommand("alarm.create", {
          label: "ping me",
          minutesFromNow: 10,
        }),
        {
          label: "ping me",
          minutesFromNow: 10,
        },
      ),
      context,
    );

    await expect(
      feature.execute(
        createFeatureExecutionRequest(createTypedFeatureCommand("alarm.list")),
        context,
      ),
    ).resolves.toEqual({
      text: "Alarms: alarm-1 at 2026-06-26T09:10:00.000Z (ping me).",
    });
  });

  it("returns a deterministic empty-list response", async () => {
    await expectFeatureExecution(
      createAlarmFeature(createTestAlarmStore()),
      createFeatureCommand("alarm.list"),
      {},
      {
        text: "There are no alarms set.",
      },
      context,
    );
  });
});

function createTestAlarmStore(): AlarmStore {
  const alarms: AlarmRecord[] = [];

  return {
    add: (alarm) => {
      alarms.push(alarm);
    },
    list: () => [...alarms],
  };
}
