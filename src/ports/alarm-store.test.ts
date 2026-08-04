import type { AlarmRecord } from "./alarm-store.js";

const baseAlarm = {
  createdAt: "2026-08-04T08:00:00.000Z",
  deliveryAttempts: 0,
  id: "alarm-1",
  label: "tea",
  revision: 1,
  scheduledFor: "2026-08-04T09:00:00.000Z",
  successfulDeliveries: 0,
  updatedAt: "2026-08-04T08:00:00.000Z",
} as const;

describe("AlarmRecord", () => {
  it("narrows lifecycle timestamps by status", () => {
    const scheduled = {
      ...baseAlarm,
      nextDeliveryAt: "2026-08-04T09:00:00.000Z",
      status: "scheduled",
    } satisfies AlarmRecord;
    const completed = {
      ...baseAlarm,
      deliveryAttempts: 1,
      status: "completed",
      successfulDeliveries: 1,
      terminalAt: "2026-08-04T09:01:00.000Z",
    } satisfies AlarmRecord;

    expect(lifecycleTimestamp(scheduled)).toBe(scheduled.nextDeliveryAt);
    expect(lifecycleTimestamp(completed)).toBe(completed.terminalAt);
  });

  it("rejects impossible lifecycle field combinations at compile time", () => {
    // @ts-expect-error Scheduled alarms require a next delivery timestamp.
    const scheduledWithoutDelivery: AlarmRecord = {
      ...baseAlarm,
      status: "scheduled",
    };
    // @ts-expect-error Terminal alarms cannot retain a next delivery timestamp.
    const completedWithDelivery: AlarmRecord = {
      ...baseAlarm,
      deliveryAttempts: 1,
      nextDeliveryAt: "2026-08-04T09:00:00.000Z",
      status: "completed",
      successfulDeliveries: 1,
      terminalAt: "2026-08-04T09:01:00.000Z",
    };

    expect(scheduledWithoutDelivery.status).toBe("scheduled");
    expect(completedWithDelivery.status).toBe("completed");
  });
});

function lifecycleTimestamp(alarm: AlarmRecord): string | undefined {
  switch (alarm.status) {
    case "scheduled":
    case "snoozed":
      return alarm.nextDeliveryAt;
    case "completed":
    case "dismissed":
    case "cancelled":
    case "missed":
      return alarm.terminalAt;
    case "ringing":
      return alarm.nextDeliveryAt;
  }
}
