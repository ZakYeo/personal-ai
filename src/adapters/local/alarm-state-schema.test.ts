import { parseAlarmState } from "./alarm-state-schema.js";

describe("alarm state schema", () => {
  it("rejects an oversized collection before parsing individual alarms", () => {
    expect(() =>
      parseAlarmState({ alarms: Array(1_001).fill(null), version: 3 }),
    ).toThrow("Alarm state cannot contain more than 1000 alarms.");
  });
});
