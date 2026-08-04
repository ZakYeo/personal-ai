import type { AlarmRecord } from "../../ports/alarm-store.js";

const maxAlarms = 1_000;

export function assertAlarmAddCapacity(alarms: readonly AlarmRecord[]): void {
  if (alarms.length >= maxAlarms) {
    throw alarmCapacityError();
  }
}

export function assertAlarmStateCapacity(alarms: readonly unknown[]): void {
  if (alarms.length > maxAlarms) {
    throw alarmCapacityError();
  }
}

function alarmCapacityError(): Error {
  return new Error(`Alarm state cannot contain more than ${maxAlarms} alarms.`);
}
