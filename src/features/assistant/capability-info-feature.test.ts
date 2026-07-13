import { createAlarmFeature } from "../alarms/alarm-feature.js";
import {
  createCapabilityInfoCatalogFeature,
  createCapabilityInfoFeature,
} from "./capability-info-feature.js";
import type { AlarmStore } from "../../ports/alarm-store.js";
import { createCapabilityCatalog } from "../../ports/capability-catalog.js";
import {
  createFeatureContext,
  expectCapabilityMetadata,
  expectDecodedFeatureExecution,
  expectFeatureHandles,
} from "../../test-support/feature-contract.js";

const context = createFeatureContext({
  assistant: {
    name: "Jarvis",
    wakePhrases: ["hey jarvis"],
  },
  features: {
    alarms: { enabled: true },
    assistant: { enabled: true },
  },
});

describe("createCapabilityInfoFeature", () => {
  it("declares capability catalog metadata", () => {
    const feature = createFeature();

    expectCapabilityMetadata(feature, {
      name: "assistant.capabilities.list",
      risk: "low",
      parameters: {},
    });
    expectCapabilityMetadata(feature, {
      name: "assistant.capabilities.describe",
      risk: "low",
      parameters: {
        name: { type: "string", required: true },
      },
    });
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
        text: "I can manage local alarms. I will ask before high-risk actions.",
      },
      context,
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
          "List the local alarms currently stored by this assistant runtime.",
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
  const alarmFeature = createAlarmFeature(createTestAlarmStore());
  const catalog = createCapabilityCatalog([
    alarmFeature,
    createCapabilityInfoCatalogFeature(),
  ]);
  const capabilityInfoFeature = createCapabilityInfoFeature(catalog);

  return capabilityInfoFeature;
}

function createTestAlarmStore(): AlarmStore {
  return {
    add: (alarm) => ({ ...alarm, id: "alarm-1" }),
    list: () => [],
  };
}
