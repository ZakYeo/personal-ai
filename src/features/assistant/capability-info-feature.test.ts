import { createAlarmFeature } from "../alarms/alarm-feature.js";
import { createCapabilityInfoFeature } from "./capability-info-feature.js";
import { createInMemoryAlarmStore } from "../../adapters/local/in-memory-alarm-store.js";
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
        text: [
          "I can use these enabled capabilities:",
          "alarm.create: Create a local alarm after a relative delay.;",
          "alarm.list: List currently stored local alarms.;",
          "assistant.capabilities.list: List enabled assistant capabilities.;",
          "assistant.capabilities.describe: Describe one enabled assistant capability.",
        ].join(" "),
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
  const alarmFeature = createAlarmFeature(createInMemoryAlarmStore());
  let features = [alarmFeature];
  const capabilityInfoFeature = createCapabilityInfoFeature(() => features);

  features = [alarmFeature, capabilityInfoFeature];

  return capabilityInfoFeature;
}
