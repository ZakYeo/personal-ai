import { createAttentionFeature } from "./attention-feature.js";
import { createTestAttentionStore } from "../../test-support/attention.js";
import {
  executeFeature,
  createFeatureContext,
  expectDecodedFeatureExecution,
} from "../../test-support/feature-contract.js";

it("requires confirmation for every persistent rule enable command", () => {
  const feature = createAttentionFeature(
    createTestAttentionStore({ timeZone: "Europe/London" }),
  );
  const commands = feature.capabilities.filter((capability) =>
    capability.name.endsWith(".enable"),
  );
  expect(commands).toHaveLength(6);
  expect(
    commands.every(
      (capability) =>
        capability.requiresConfirmation && capability.risk === "high",
    ),
  ).toBe(true);
});
it("writes only an explicit validated rule with user provenance", async () => {
  const store = createTestAttentionStore({ timeZone: "Europe/London" });
  const feature = createAttentionFeature(store);
  await expectDecodedFeatureExecution(
    feature,
    "attention.tasks.enable",
    { name: "Due work", daysAhead: 1 },
    {
      data: {
        id: "attention-rule-1",
        name: "Due work",
        timeZone: "Europe/London",
        quietStart: "22:00",
        quietEnd: "08:00",
        cooldownMinutes: 60,
        revision: 1,
      },
      text: "Enabled Due work. Quiet hours are 22:00 to 08:00, with at least 60 minutes between notifications from this rule.",
    },
    createFeatureContext(),
  );
  expect((await store.read()).rules).toMatchObject([
    {
      enabled: true,
      definition: { kind: "due_tasks", daysAhead: 1 },
      provenance: { kind: "user_authored" },
    },
  ]);
});

it("rejects invalid weather quiet hours before requesting confirmation", () => {
  const capability = createAttentionFeature(
    createTestAttentionStore({ timeZone: "Europe/London" }),
  ).capabilities.find((entry) => entry.name === "attention.weather.enable");
  expect(() =>
    capability?.renderConfirmation?.(
      {
        name: "Rain",
        location: "London",
        metric: "precipitation",
        operator: "atLeast",
        threshold: 1,
        periodHours: 2,
        quietStart: "broken",
      },
      createFeatureContext(),
    ),
  ).toThrow();
});

it("exposes bounded day planning as a terminal read without requiring another reply", async () => {
  const feature = createAttentionFeature(
    createTestAttentionStore({ timeZone: "Europe/London" }),
  );
  const result = await executeFeature(
    feature,
    "attention.plan_day",
    {},
    createFeatureContext(),
  );
  expect(result.text).toContain("suggestions");
  expect(result).not.toHaveProperty("expectsFollowUp");
  expect(
    feature.capabilities.find(
      (capability) => capability.name === "attention.plan_day",
    )?.toolChain,
  ).toBeUndefined();
});
