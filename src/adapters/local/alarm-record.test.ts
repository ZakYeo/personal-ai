import type { AlarmRecord, AlarmStatus } from "../../ports/alarm-store.js";
import { applyAlarmLifecycleUpdate } from "./alarm-record.js";

describe("applyAlarmLifecycleUpdate", () => {
  it.each([
    ["daily", "2026-03-28T01:30:00.000Z", "2026-03-29T01:30:00.000Z"],
    ["weekly", "2026-10-18T00:30:00.000Z", "2026-10-25T00:30:00.000Z"],
  ] as const)(
    "advances a %s recurrence at the same Europe/London wall time across DST",
    (frequency, scheduledFor, nextScheduledFor) => {
      const alarm: AlarmRecord = {
        ...alarmInStatus("ringing"),
        recurrence: { frequency, timeZone: "Europe/London" },
        scheduledFor,
        updatedAt: new Date(
          new Date(scheduledFor).getTime() - 60_000,
        ).toISOString(),
      };

      expect(
        applyAlarmLifecycleUpdate(alarm, {
          changes: { nextDeliveryAt: null, status: "completed" },
          expectedRevision: alarm.revision,
          id: alarm.id,
          updatedAt: scheduledFor,
        }),
      ).toEqual(
        expect.objectContaining({
          deliveryAttempts: 0,
          nextDeliveryAt: nextScheduledFor,
          scheduledFor: nextScheduledFor,
          status: "scheduled",
          successfulDeliveries: 0,
        }),
      );
    },
  );

  it("skips elapsed recurring occurrences after a long outage", () => {
    const alarm: AlarmRecord = {
      ...alarmInStatus("ringing"),
      recurrence: { frequency: "daily", timeZone: "Europe/London" },
      scheduledFor: "2026-07-10T08:10:00.000Z",
    };

    expect(
      applyAlarmLifecycleUpdate(alarm, {
        changes: { nextDeliveryAt: null, status: "missed" },
        expectedRevision: alarm.revision,
        id: alarm.id,
        updatedAt: "2026-07-14T09:11:00.000Z",
      }),
    ).toEqual(
      expect.objectContaining({
        scheduledFor: "2026-07-15T08:10:00.000Z",
        status: "scheduled",
      }),
    );
  });

  it.each([
    ["scheduled", "completed"],
    ["ringing", "cancelled"],
    ["completed", "completed"],
    ["dismissed", "dismissed"],
    ["cancelled", "cancelled"],
    ["missed", "missed"],
  ] satisfies Array<[AlarmStatus, AlarmStatus]>)(
    "rejects illegal transitions from %s",
    (status, nextStatus) => {
      const alarm = alarmInStatus(status);

      expect(() =>
        applyAlarmLifecycleUpdate(alarm, {
          changes: { status: nextStatus },
          expectedRevision: alarm.revision,
          id: alarm.id,
          updatedAt: "2026-07-14T09:11:00.000Z",
        }),
      ).toThrow("Alarm lifecycle update is invalid.");
    },
  );
});

function alarmInStatus(status: AlarmStatus): AlarmRecord {
  const attempts =
    status === "ringing" || status === "completed" || status === "dismissed"
      ? 1
      : 0;
  const successfulDeliveries = status === "completed" ? 1 : 0;
  const active = status === "scheduled" || status === "ringing";

  return {
    createdAt: "2026-07-14T09:00:00.000Z",
    deliveryAttempts: attempts,
    id: "alarm-1",
    label: "tea",
    ...(active ? { nextDeliveryAt: "2026-07-14T09:10:00.000Z" } : {}),
    revision: 1,
    scheduledFor: "2026-07-14T09:10:00.000Z",
    status,
    successfulDeliveries,
    updatedAt: "2026-07-14T09:10:00.000Z",
  };
}
