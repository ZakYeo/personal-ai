import type { AlarmRecord, AlarmStatus } from "../../ports/alarm-store.js";
import { applyAlarmLifecycleUpdate } from "./alarm-record.js";

describe("applyAlarmLifecycleUpdate", () => {
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
