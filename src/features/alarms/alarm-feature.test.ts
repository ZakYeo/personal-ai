import { createAlarmFeature } from "./alarm-feature.js";
import type { AlarmRecord, AlarmStore } from "../../ports/alarm-store.js";
import { createScheduledAlarmRecord } from "../../test-support/primitives.js";
import {
  createFeatureContext,
  executeFeature,
  expectCapabilityMetadata,
  expectDecodedFeatureExecution,
  expectFeatureHandles,
} from "../../test-support/feature-contract.js";

const context = createFeatureContext();

describe("createAlarmFeature", () => {
  it("declares alarm capability metadata", () => {
    const feature = createAlarmFeature(createTestAlarmStore());

    expectCapabilityMetadata(feature, {
      name: "alarm.create",
      risk: "high",
      requiresConfirmation: true,
      parameters: {
        label: { type: "string" },
        minutesFromNow: { type: "number", required: true, positive: true },
      },
    });
    expectCapabilityMetadata(feature, {
      name: "alarm.acknowledge",
      risk: "low",
      parameters: {
        id: { type: "string" },
        label: { type: "string" },
      },
    });
    expectCapabilityMetadata(feature, {
      name: "alarm.dismiss",
      risk: "low",
      parameters: {
        id: { type: "string" },
        label: { type: "string" },
      },
    });
    expectCapabilityMetadata(feature, {
      name: "alarm.cancel",
      risk: "high",
      requiresConfirmation: true,
      parameters: {
        id: { type: "string" },
        label: { type: "string" },
      },
    });
    expectCapabilityMetadata(feature, {
      name: "alarm.list",
      risk: "low",
      parameters: {},
    });
    expect(feature.capabilities).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          deterministicRules: expect.any(Array) as unknown,
        }),
      ]),
    );
  });

  it("handles alarm create and list commands", () => {
    const feature = createAlarmFeature(createTestAlarmStore());

    expectFeatureHandles(feature, "alarm.create", "calendar.search_events");
    expectFeatureHandles(feature, "alarm.list", "calendar.search_events");
  });

  it("creates deterministic alarms using the injected clock", async () => {
    await expectDecodedFeatureExecution(
      createAlarmFeature(createTestAlarmStore()),
      "alarm.create",
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

  it("uses the alarm ID assigned by the store", async () => {
    await expectDecodedFeatureExecution(
      createAlarmFeature(createTestAlarmStore("persisted-alarm")),
      "alarm.create",
      {
        label: "ping me",
        minutesFromNow: 10,
      },
      {
        text: "Alarm set for 2026-06-26T09:10:00.000Z (ping me).",
        data: {
          id: "persisted-alarm-1",
          label: "ping me",
          scheduledFor: "2026-06-26T09:10:00.000Z",
        },
      },
      context,
    );
  });

  it("lists alarms from the in-memory store", async () => {
    const feature = createAlarmFeature(createTestAlarmStore());

    await executeFeature(
      feature,
      "alarm.create",
      {
        label: "ping me",
        minutesFromNow: 10,
      },
      context,
    );

    await expect(
      executeFeature(feature, "alarm.list", {}, context),
    ).resolves.toEqual({
      text: "Alarms: alarm-1 at 2026-06-26T09:10:00.000Z (ping me).",
      data: {
        alarm0Id: "alarm-1",
        alarm0Label: "ping me",
        alarm0ScheduledFor: "2026-06-26T09:10:00.000Z",
      },
    });
  });

  it("returns a deterministic empty-list response", async () => {
    await expectDecodedFeatureExecution(
      createAlarmFeature(createTestAlarmStore()),
      "alarm.list",
      {},
      {
        text: "There are no alarms set.",
      },
      context,
    );
  });

  it("acknowledges the single ringing alarm and clears its repeat", async () => {
    const store = createTestAlarmStore();
    const alarm = await store.add({
      label: "tea",
      scheduledFor: "2026-06-26T09:00:00.000Z",
    });
    await store.update({
      changes: {
        deliveryAttempts: 1,
        nextDeliveryAt: "2026-06-26T09:01:00.000Z",
        status: "ringing",
        successfulDeliveries: 1,
      },
      expectedRevision: alarm.revision,
      id: alarm.id,
      updatedAt: "2026-06-26T09:00:00.000Z",
    });

    await expectDecodedFeatureExecution(
      createAlarmFeature(store),
      "alarm.acknowledge",
      {},
      {
        data: { id: alarm.id, label: "tea", status: "completed" },
        text: "Acknowledged the tea alarm.",
      },
      context,
    );
    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({ status: "completed" }),
    ]);
    expect((await store.list())[0]?.nextDeliveryAt).toBeUndefined();
  });

  it("dismisses a ringing alarm by unambiguous label", async () => {
    const store = createTestAlarmStore();
    const alarm = await store.add({
      label: "tea",
      scheduledFor: "2026-06-26T09:00:00.000Z",
    });
    await store.update({
      changes: { status: "ringing" },
      expectedRevision: alarm.revision,
      id: alarm.id,
      updatedAt: "2026-06-26T09:00:00.000Z",
    });

    await expectDecodedFeatureExecution(
      createAlarmFeature(store),
      "alarm.dismiss",
      { label: "TEA" },
      {
        data: { id: alarm.id, label: "tea", status: "dismissed" },
        text: "Dismissed the tea alarm.",
      },
      context,
    );
  });

  it("cancels a scheduled alarm by ID", async () => {
    const store = createTestAlarmStore();
    const alarm = await store.add({
      label: "tea",
      scheduledFor: "2026-06-26T09:10:00.000Z",
    });

    await expectDecodedFeatureExecution(
      createAlarmFeature(store),
      "alarm.cancel",
      { id: alarm.id },
      {
        data: { id: alarm.id, label: "tea", status: "cancelled" },
        text: "Cancelled the tea alarm.",
      },
      context,
    );
  });

  it("keeps the prompt active when a lifecycle target is ambiguous", async () => {
    const store = createTestAlarmStore();
    await store.add({
      label: "tea",
      scheduledFor: "2026-06-26T09:10:00.000Z",
    });
    await store.add({
      label: "tea",
      scheduledFor: "2026-06-26T09:20:00.000Z",
    });

    await expectDecodedFeatureExecution(
      createAlarmFeature(store),
      "alarm.cancel",
      { label: "tea" },
      {
        text: "More than one alarm is labelled tea. Please use its ID.",
      },
      context,
    );
  });

  it("waits for store failures instead of reporting success early", async () => {
    const failure = new Error("persistent alarm write failed");
    const store = createTestAlarmStore();
    store.add = () => Promise.reject(failure);

    await expect(
      executeFeature(
        createAlarmFeature(store),
        "alarm.create",
        { label: "ping me", minutesFromNow: 10 },
        context,
      ),
    ).rejects.toBe(failure);
  });
});

function createTestAlarmStore(idPrefix = "alarm"): AlarmStore {
  const alarms: AlarmRecord[] = [];

  return {
    add: (alarm) => {
      const storedAlarm = createScheduledAlarmRecord({
        ...alarm,
        id: `${idPrefix}-${alarms.length + 1}`,
      });

      alarms.push(storedAlarm);

      return Promise.resolve(storedAlarm);
    },
    list: () => Promise.resolve([...alarms]),
    update: (update) => {
      const index = alarms.findIndex((alarm) => alarm.id === update.id);
      const alarm = alarms[index];
      if (!alarm || alarm.revision !== update.expectedRevision) {
        return Promise.resolve(undefined);
      }

      let updated: AlarmRecord = {
        ...alarm,
        revision: alarm.revision + 1,
        updatedAt: update.updatedAt,
      };
      if (update.changes.deliveryAttempts !== undefined) {
        updated = {
          ...updated,
          deliveryAttempts: update.changes.deliveryAttempts,
        };
      }
      if (update.changes.status !== undefined) {
        updated = { ...updated, status: update.changes.status };
      }
      if (update.changes.successfulDeliveries !== undefined) {
        updated = {
          ...updated,
          successfulDeliveries: update.changes.successfulDeliveries,
        };
      }
      if (typeof update.changes.nextDeliveryAt === "string") {
        updated = {
          ...updated,
          nextDeliveryAt: update.changes.nextDeliveryAt,
        };
      }
      if (update.changes.nextDeliveryAt === null) {
        delete updated.nextDeliveryAt;
      }
      alarms[index] = updated;
      return Promise.resolve(updated);
    },
  };
}
