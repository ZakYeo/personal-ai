import { createCapabilityRoutingIndex } from "../../application/capability-catalog.js";
import { validateAssistantPlan } from "../../core/assistant/plan-validation.js";
import { createTestAlarmStore } from "../../test-support/alarm-store.js";
import {
  createAssistantConfig,
  createCommand,
} from "../../test-support/core-assistant.js";
import { createAlarmFeature } from "./alarm-feature.js";

describe("alarm action preparation", () => {
  it.each(["alarm.create", "alarm.reschedule"])(
    "retains %s time when a later preparation changes only the label",
    (capability) => {
      const feature = createAlarmFeature(createTestAlarmStore());
      const capabilityRouting = createCapabilityRoutingIndex([feature]);
      const config = createAssistantConfig({ alarms: { enabled: true } });
      let now = new Date("2026-09-07T12:00:00.000Z");
      const validate = (
        parameters: Record<string, string | number | boolean | undefined>,
      ) =>
        validateAssistantPlan({
          capabilityRouting,
          config,
          context: { config, clock: { now: () => now } },
          commands: [createCommand(capability, parameters)],
          kind: "single",
          originalText: "set alarm",
        });
      const first = validate({ label: "tea", minutesFromNow: 10 });
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error("Expected preparation.");
      const parameters = first.plan.steps[0]!.decodedArgs;
      expect(parameters).toEqual({
        label: "tea",
        scheduledFor: "2026-09-07T12:10:00.000Z",
      });
      now = new Date("2026-09-07T12:01:00.000Z");
      const corrected = validate({ ...parameters, label: "coffee" });
      expect(corrected.ok).toBe(true);
      if (!corrected.ok) throw new Error("Expected corrected preparation.");
      expect(corrected.plan.steps[0]!.decodedArgs).toEqual({
        ...parameters,
        label: "coffee",
      });
    },
  );

  it.each([
    { scheduledFor: "2026-02-30T12:00:00.000Z" },
    { scheduledFor: "2026-09-07T11:00:00.000Z" },
    { scheduledFor: "2026-09-07T12:10:00.000Z", minutesFromNow: 10 },
  ])(
    "rejects invalid or conflicting time input %j before confirmation",
    (parameters) => {
      const feature = createAlarmFeature(createTestAlarmStore());
      const config = createAssistantConfig({ alarms: { enabled: true } });
      const result = validateAssistantPlan({
        capabilityRouting: createCapabilityRoutingIndex([feature]),
        config,
        context: {
          config,
          clock: { now: () => new Date("2026-09-07T12:00:00.000Z") },
        },
        commands: [createCommand("alarm.create", parameters)],
        kind: "single",
        originalText: "set alarm",
      });
      expect(result.ok).toBe(false);
    },
  );
});
