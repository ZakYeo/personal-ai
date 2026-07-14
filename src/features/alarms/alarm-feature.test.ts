import { createAlarmFeature } from "./alarm-feature.js";
import { createTestAlarmStore } from "../../test-support/alarm-store.js";
import { createScheduledAlarmRecord } from "../../test-support/primitives.js";
import type { AlarmRecurrence, AlarmStore } from "../../ports/alarm-store.js";
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
        recurrenceFrequency: { type: "string" },
        recurrenceTimeZone: { type: "string" },
      },
    });
    expectCapabilityMetadata(feature, {
      name: "alarm.snooze",
      risk: "low",
      parameters: {
        id: { type: "string" },
        label: { type: "string" },
        minutesFromNow: { type: "number", required: true, positive: true },
      },
    });
    expectCapabilityMetadata(feature, {
      name: "alarm.reschedule",
      risk: "high",
      requiresConfirmation: true,
      parameters: {
        id: { type: "string" },
        label: { type: "string" },
        minutesFromNow: { type: "number", required: true, positive: true },
      },
    });
    expectCapabilityMetadata(feature, {
      name: "alarm.edit",
      risk: "low",
      parameters: {
        id: { type: "string" },
        label: { type: "string" },
        newLabel: { type: "string", required: true },
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

  it("creates a daily alarm with an explicit IANA timezone", async () => {
    await expectDecodedFeatureExecution(
      createAlarmFeature(createTestAlarmStore()),
      "alarm.create",
      {
        label: "morning tea",
        minutesFromNow: 10,
        recurrenceFrequency: "daily",
        recurrenceTimeZone: "Europe/London",
      },
      {
        text: "Daily alarm set for 2026-06-26T09:10:00.000Z (morning tea) in Europe/London.",
        data: {
          id: "alarm-1",
          label: "morning tea",
          recurrenceFrequency: "daily",
          recurrenceTimeZone: "Europe/London",
          scheduledFor: "2026-06-26T09:10:00.000Z",
        },
      },
      context,
    );
  });

  it("describes recurrence in the human-facing alarm status", async () => {
    const store = createTestAlarmStore();
    await store.add({
      label: "morning tea",
      recurrence: { frequency: "weekly", timeZone: "Europe/London" },
      scheduledFor: "2026-06-26T09:10:00.000Z",
    });

    await expect(
      executeFeature(createAlarmFeature(store), "alarm.list", {}, context),
    ).resolves.toEqual({
      data: {
        alarm0Id: "alarm-1",
        alarm0Label: "morning tea",
        alarm0RecurrenceFrequency: "weekly",
        alarm0RecurrenceTimeZone: "Europe/London",
        alarm0ScheduledFor: "2026-06-26T09:10:00.000Z",
        alarm0Status: "scheduled",
      },
      text: "The morning tea alarm (alarm-1) is scheduled for 2026-06-26T09:10:00.000Z and repeats weekly in Europe/London.",
    });
  });

  it.each([
    [{ recurrenceFrequency: "monthly" }, "daily or weekly"],
    [{ recurrenceFrequency: "daily" }, "explicit IANA timezone"],
    [{ recurrenceTimeZone: "Europe/London" }, "frequency"],
    [
      { recurrenceFrequency: "weekly", recurrenceTimeZone: "not/a-zone" },
      "valid IANA timezone",
    ],
  ])("rejects invalid recurrence parameters", async (parameters, message) => {
    await expect(
      executeFeature(
        createAlarmFeature(createTestAlarmStore()),
        "alarm.create",
        { label: "tea", minutesFromNow: 10, ...parameters },
        context,
      ),
    ).rejects.toThrow(message);
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
      text: "The ping me alarm (alarm-1) is scheduled for 2026-06-26T09:10:00.000Z.",
      data: {
        alarm0Id: "alarm-1",
        alarm0Label: "ping me",
        alarm0ScheduledFor: "2026-06-26T09:10:00.000Z",
        alarm0Status: "scheduled",
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
    const { alarm } = await addRingingAlarm(store);

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

  it("acknowledges a ringing recurring alarm by scheduling its next occurrence", async () => {
    const store = createTestAlarmStore();
    const { alarm } = await addRingingAlarm(store, {
      frequency: "daily",
      timeZone: "Europe/London",
    });

    await expectDecodedFeatureExecution(
      createAlarmFeature(store),
      "alarm.acknowledge",
      {},
      {
        data: {
          id: alarm.id,
          label: "tea",
          scheduledFor: "2026-06-27T09:00:00.000Z",
          status: "scheduled",
        },
        text: "Acknowledged the tea alarm. Its next occurrence is 2026-06-27T09:00:00.000Z.",
      },
      context,
    );
  });

  it("dismisses a ringing alarm by unambiguous label", async () => {
    const store = createTestAlarmStore();
    const { alarm } = await addRingingAlarm(store);

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

  it("snoozes a ringing alarm with reset delivery attempts", async () => {
    const store = createTestAlarmStore();
    const { alarm, ringing } = await addRingingAlarm(store);

    await expectDecodedFeatureExecution(
      createAlarmFeature(store),
      "alarm.snooze",
      { id: alarm.id, minutesFromNow: 5 },
      {
        data: {
          id: alarm.id,
          label: "tea",
          nextDeliveryAt: "2026-06-26T09:05:00.000Z",
          status: "snoozed",
        },
        text: "Snoozed the tea alarm until 2026-06-26T09:05:00.000Z.",
      },
      context,
    );
    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({
        deliveryAttempts: 0,
        nextDeliveryAt: "2026-06-26T09:05:00.000Z",
        revision: (ringing?.revision ?? 0) + 1,
        status: "snoozed",
        successfulDeliveries: 0,
      }),
    ]);
  });

  it("reschedules a pending alarm without changing its identity", async () => {
    const store = createTestAlarmStore();
    const alarm = await store.add({
      label: "tea",
      scheduledFor: "2026-06-26T09:10:00.000Z",
    });

    await expectDecodedFeatureExecution(
      createAlarmFeature(store),
      "alarm.reschedule",
      { id: alarm.id, minutesFromNow: 30 },
      {
        data: {
          id: alarm.id,
          label: "tea",
          scheduledFor: "2026-06-26T09:30:00.000Z",
          status: "scheduled",
        },
        text: "Rescheduled the tea alarm for 2026-06-26T09:30:00.000Z.",
      },
      context,
    );
    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({
        id: alarm.id,
        nextDeliveryAt: "2026-06-26T09:30:00.000Z",
        scheduledFor: "2026-06-26T09:30:00.000Z",
      }),
    ]);
  });

  it("edits a pending alarm label without changing its schedule", async () => {
    const store = createTestAlarmStore();
    const alarm = await store.add({
      label: "tea",
      scheduledFor: "2026-06-26T09:10:00.000Z",
    });

    await expectDecodedFeatureExecution(
      createAlarmFeature(store),
      "alarm.edit",
      { id: alarm.id, newLabel: "morning tea" },
      {
        data: { id: alarm.id, label: "morning tea", status: "scheduled" },
        text: "Renamed the tea alarm to morning tea.",
      },
      context,
    );
    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({
        id: alarm.id,
        label: "morning tea",
        scheduledFor: alarm.scheduledFor,
      }),
    ]);
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

  it("pins a selected alarm across an optimistic update conflict", async () => {
    const first = createScheduledAlarmRecord({
      deliveryAttempts: 1,
      id: "alarm-a",
      label: "tea",
      nextDeliveryAt: "2026-06-26T09:01:00.000Z",
      scheduledFor: "2026-06-26T09:00:00.000Z",
      status: "ringing",
    });
    const completed = createScheduledAlarmRecord({
      ...first,
      nextDeliveryAt: undefined,
      revision: 2,
      status: "completed",
      successfulDeliveries: 1,
      terminalAt: "2026-06-26T09:00:30.000Z",
    });
    const second = createScheduledAlarmRecord({
      deliveryAttempts: 1,
      id: "alarm-b",
      label: "coffee",
      nextDeliveryAt: "2026-06-26T09:01:00.000Z",
      scheduledFor: "2026-06-26T09:00:00.000Z",
      status: "ringing",
    });
    let lists = 0;
    const update = vi.fn(() => Promise.resolve(undefined));
    const store: AlarmStore = {
      add: () => Promise.reject(new Error("not used")),
      list: () =>
        Promise.resolve(lists++ === 0 ? [first] : [completed, second]),
      removeTerminalBefore: () => Promise.resolve(0),
      update,
    };

    await expectDecodedFeatureExecution(
      createAlarmFeature(store),
      "alarm.snooze",
      { minutesFromNow: 5 },
      {
        text: "The tea alarm cannot be changed while it is completed.",
      },
      context,
    );
    expect(update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "alarm-a" }));
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

async function addRingingAlarm(
  store: AlarmStore,
  recurrence?: AlarmRecurrence,
) {
  const alarm = await store.add({
    label: "tea",
    ...(recurrence ? { recurrence } : {}),
    scheduledFor: "2026-06-26T09:00:00.000Z",
  });
  const ringing = await store.update({
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

  return { alarm, ringing };
}
