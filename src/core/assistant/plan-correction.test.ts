import { createCapabilityRoutingIndex } from "../../application/capability-catalog.js";
import {
  createAssistantConfig,
  createCommand,
  createFixedClock,
  createRawFeature,
} from "../../test-support/core-assistant.js";
import { applyPlanCorrection } from "./plan-correction.js";
import { validateAssistantPlan } from "./plan-validation.js";

function preparedPlan(count = 1) {
  const feature = createRawFeature({
    capabilities: [
      {
        name: "test.schedule",
        risk: "low",
        parameters: {
          instant: { type: "string", required: true },
          label: { type: "string" },
        },
      },
    ],
  });
  const config = createAssistantConfig();
  const result = validateAssistantPlan({
    capabilityRouting: createCapabilityRoutingIndex([feature]),
    commands: Array.from({ length: count }, (_, index) =>
      createCommand("test.schedule", {
        instant: `instant-${index}`,
        label: "tea",
      }),
    ),
    config,
    context: { config, clock: createFixedClock() },
    kind: count === 1 ? "single" : "compound",
    originalText: "prepare",
  });
  if (!result.ok) throw new Error("Expected a prepared plan.");
  return result.plan;
}

describe("plan correction patches", () => {
  it("retains unmentioned facts and permits explicit removal of an optional field", () => {
    const plan = preparedPlan();
    const result = applyPlanCorrection(
      plan,
      {
        kind: "command",
        command: createCommand("test.schedule", { label: null }),
      },
      "remove the label",
    );
    expect(result[0]?.parameters).toEqual({ instant: "instant-0" });
    expect(result[0]?.rawText).toBe("remove the label");
    expect(plan.steps[0]?.decodedArgs).toEqual({
      instant: "instant-0",
      label: "tea",
    });
  });

  it("preserves the exact step positions when the same capability appears twice", () => {
    const result = applyPlanCorrection(
      preparedPlan(2),
      {
        kind: "plan",
        plan: {
          commands: [
            createCommand("test.schedule"),
            createCommand("test.schedule", { label: "coffee" }),
          ],
        },
      },
      "change the second label",
    );
    expect(result.map((command) => command.parameters)).toEqual([
      { instant: "instant-0", label: "tea" },
      { instant: "instant-1", label: "coffee" },
    ]);
  });

  it.each([
    createCommand("other.action", { label: "coffee" }),
    createCommand("test.schedule", { instant: null }),
    createCommand("test.schedule", { label: 42 }),
    createCommand("test.schedule", { privateTarget: "extra" }),
    createCommand("test.schedule", { label: "x".repeat(8_001) }),
  ])("rejects route or field corruption %j", (command) => {
    expect(() =>
      applyPlanCorrection(
        preparedPlan(),
        { kind: "command", command },
        "change",
      ),
    ).toThrow();
  });
  it("rejects dropping a compound step", () => {
    expect(() =>
      applyPlanCorrection(
        preparedPlan(2),
        {
          kind: "command",
          command: createCommand("test.schedule", { label: "coffee" }),
        },
        "change",
      ),
    ).toThrow();
  });
});
