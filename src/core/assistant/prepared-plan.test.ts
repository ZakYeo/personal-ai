import { createCapabilityRoutingIndex } from "../../application/capability-catalog.js";
import {
  createAssistantConfig,
  createCommand,
  createRawFeature,
  createFixedClock,
} from "../../test-support/core-assistant.js";
import { validateAssistantPlan } from "./plan-validation.js";

describe("prepared plan arguments", () => {
  it("freezes normalized facts before confirmation and revalidates prepared fields", () => {
    const prepared = { instant: "2026-09-07T12:10:00.000Z" };
    const confirmation = vi.fn(
      (args: Record<string, string | number | boolean | undefined>) => ({
        text: `Use ${args.instant}`,
        facts: args,
      }),
    );
    const feature = createRawFeature({
      capabilities: [
        {
          name: "test.schedule",
          risk: "high",
          parameters: {
            delay: { type: "number" },
            instant: { type: "string" },
          },
          prepareArguments: () => prepared,
          renderConfirmation: confirmation,
        },
      ],
    });
    const config = createAssistantConfig();
    const validate = () =>
      validateAssistantPlan({
        capabilityRouting: createCapabilityRoutingIndex([feature]),
        commands: [createCommand("test.schedule", { delay: 10 })],
        config,
        context: { config, clock: createFixedClock() },
        kind: "single",
        originalText: "schedule",
      });
    const result = validate();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a validated plan.");
    expect(result.plan.steps[0]?.command.parameters).toEqual(prepared);
    expect(result.plan.steps[0]?.decodedArgs).toEqual(prepared);
    expect(confirmation).toHaveBeenCalledWith(prepared, expect.anything());
    prepared.instant = "changed after preparation";
    expect(result.plan.steps[0]?.decodedArgs.instant).toBe(
      "2026-09-07T12:10:00.000Z",
    );
  });

  it("rejects undeclared prepared fields before rendering confirmation", () => {
    const confirmation = vi.fn();
    const feature = createRawFeature({
      capabilities: [
        {
          name: "test.schedule",
          risk: "high",
          parameters: {},
          prepareArguments: () => ({ privateTarget: "unexpected" }),
          renderConfirmation: confirmation,
        },
      ],
    });
    const config = createAssistantConfig();
    const result = validateAssistantPlan({
      capabilityRouting: createCapabilityRoutingIndex([feature]),
      commands: [createCommand("test.schedule")],
      config,
      context: { config, clock: createFixedClock() },
      kind: "single",
      originalText: "schedule",
    });
    expect(result.ok).toBe(false);
    expect(confirmation).not.toHaveBeenCalled();
  });
});
