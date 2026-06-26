import {
  createAlarmFeature,
  createInMemoryAlarmStore,
} from "./alarm-feature.js";
import {
  createFeatureCommand,
  createFeatureContext,
  expectCapabilityMetadata,
  expectFeatureExecution,
  expectFeatureHandles,
  expectFeatureRejects,
} from "../../test-support/feature-contract.js";

const context = createFeatureContext();

describe("createAlarmFeature", () => {
  it("declares alarm capability metadata", () => {
    const feature = createAlarmFeature(createInMemoryAlarmStore());

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
    const feature = createAlarmFeature(createInMemoryAlarmStore());

    expectFeatureHandles(
      feature,
      "alarm.create",
      "calendar.search_events",
      context,
    );
    expectFeatureHandles(
      feature,
      "alarm.list",
      "calendar.search_events",
      context,
    );
  });

  it("creates deterministic alarms using the injected clock", async () => {
    await expectFeatureExecution(
      createAlarmFeature(createInMemoryAlarmStore()),
      createFeatureCommand("alarm.create", {
        label: "ping me",
        minutesFromNow: 10,
      }),
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
    const feature = createAlarmFeature(createInMemoryAlarmStore());

    await feature.execute(
      createFeatureCommand("alarm.create", {
        label: "ping me",
        minutesFromNow: 10,
      }),
      context,
    );

    await expect(
      feature.execute(createFeatureCommand("alarm.list"), context),
    ).resolves.toEqual({
      text: "Alarms: alarm-1 at 2026-06-26T09:10:00.000Z (ping me).",
    });
  });

  it("returns a deterministic empty-list response", async () => {
    await expectFeatureExecution(
      createAlarmFeature(createInMemoryAlarmStore()),
      createFeatureCommand("alarm.list"),
      {
        text: "There are no alarms set.",
      },
      context,
    );
  });

  it.each([
    ["missing", {}],
    ["non-finite", { minutesFromNow: Number.NaN }],
    ["zero", { minutesFromNow: 0 }],
    ["negative", { minutesFromNow: -5 }],
    ["string", { minutesFromNow: "10" }],
  ])("rejects %s alarm timing", async (_caseName, parameters) => {
    await expectFeatureRejects(
      createAlarmFeature(createInMemoryAlarmStore()),
      createFeatureCommand("alarm.create", parameters),
      "Alarm minutesFromNow must be a positive finite number.",
      context,
    );
  });
});
