import { createAlarmFeature } from "../alarms/alarm-feature.js";
import {
  createCapabilityInfoCatalogFeature,
  createCapabilityInfoFeature,
} from "./capability-info-feature.js";
import type { AlarmStore } from "../../ports/alarm-store.js";
import { createScheduledAlarmRecord } from "../../test-support/primitives.js";
import { createCapabilityCatalog } from "../../application/capability-catalog.js";
import {
  createFeatureContext,
  expectCapabilityMetadata,
  expectDecodedFeatureExecution,
  expectFeatureHandles,
} from "../../test-support/feature-contract.js";

const catalog = createCapabilityCatalog([
  createAlarmFeature(createTestAlarmStore()),
  createCapabilityInfoCatalogFeature(),
]);
const context = createFeatureContext(
  {
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    features: {
      alarms: { enabled: true },
      assistant: { enabled: true },
    },
  },
  catalog,
);

describe("createCapabilityInfoFeature", () => {
  it("declares capability catalog metadata", () => {
    const feature = createFeature();

    expectCapabilityMetadata(feature, {
      name: "assistant.capabilities.list",
      risk: "low",
      parameters: {
        detailed: {
          description:
            "Set true only when the user explicitly requests a complete or detailed capability list.",
          type: "boolean",
        },
      },
    });
    expectCapabilityMetadata(feature, {
      name: "assistant.capabilities.describe",
      risk: "low",
      parameters: {
        name: { type: "string", required: true },
      },
    });
  });

  it("keeps human-facing capability answers terminal-only", () => {
    const feature = createFeature();

    expect(
      feature.capabilities.map(({ name, toolChain }) => ({ name, toolChain })),
    ).toEqual([
      { name: "assistant.capabilities.list", toolChain: undefined },
      { name: "assistant.capabilities.describe", toolChain: undefined },
    ]);
  });

  it("handles capability list and describe commands", () => {
    const feature = createFeature();

    expectFeatureHandles(
      feature,
      "assistant.capabilities.list",
      "calendar.search_events",
    );
    expectFeatureHandles(
      feature,
      "assistant.capabilities.describe",
      "calendar.search_events",
    );
  });

  it("lists enabled capabilities from the generated catalog", async () => {
    await expectDecodedFeatureExecution(
      createFeature(),
      "assistant.capabilities.list",
      {},
      {
        text: "I can manage local alarms and set reminders from calendar events. I will ask before high-risk actions.",
      },
      context,
    );
  });

  it("expands individual capabilities only for an explicit detailed request", async () => {
    const result = await createFeature().execute(
      {
        args: { detailed: true },
        capability: "assistant.capabilities.list",
        command: {
          capability: "assistant.capabilities.list",
          parameters: { detailed: true },
          rawText: "Give me the exact list of all capabilities",
        },
      },
      context,
    );

    expect(result.text).toContain("list local alarms");
    expect(result.text).toContain(
      "create a snapshot alarm before a calendar event",
    );
  });

  it("describes a specific enabled capability", async () => {
    await expectDecodedFeatureExecution(
      createFeature(),
      "assistant.capabilities.describe",
      { name: "alarm.list" },
      {
        text: [
          "alarm.list (Local Alarms):",
          "List local alarms with their human-facing lifecycle status.",
          "Risk: low.",
          "Parameters: none.",
        ].join(" "),
      },
      context,
    );
  });

  it("reports unknown capability names without exposing diagnostics", async () => {
    await expectDecodedFeatureExecution(
      createFeature(),
      "assistant.capabilities.describe",
      { name: "calendar.delete" },
      {
        text: "I do not have an enabled capability named calendar.delete.",
      },
      context,
    );
  });
});

function createFeature() {
  return createCapabilityInfoFeature();
}

function createTestAlarmStore(): AlarmStore {
  return {
    add: (alarm) =>
      Promise.resolve(createScheduledAlarmRecord({ ...alarm, id: "alarm-1" })),
    list: () => Promise.resolve([]),
    removeTerminalBefore: () => Promise.resolve(0),
    update: () => Promise.resolve(undefined),
  };
}
