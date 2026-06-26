import { evaluateConfirmationPolicy } from "./confirmation-policy.js";
import type { AssistantConfig } from "../../ports/assistant.js";
import type { FeatureCapability, FeaturePlugin } from "../../ports/feature.js";

const config: AssistantConfig = {
  assistant: {
    name: "Jarvis",
    wakePhrases: ["hey jarvis"],
  },
  features: {
    alarms: {
      enabled: true,
      confirmationRequiredCapabilities: ["alarm.create"],
    },
    messaging: { enabled: true },
  },
};

describe("evaluateConfirmationPolicy", () => {
  it("requires confirmation for capabilities listed in config", () => {
    expect(
      evaluateConfirmationPolicy(
        createFeature("alarms"),
        createCapability("alarm.create"),
        config,
      ),
    ).toMatchObject({
      category: "confirmation_required",
      capability: "alarm.create",
    });
  });

  it("requires confirmation for capabilities that require it by default", () => {
    expect(
      evaluateConfirmationPolicy(
        createFeature("messaging"),
        {
          ...createCapability("messaging.send_reply"),
          requiresConfirmation: true,
        },
        config,
      ),
    ).toMatchObject({
      category: "confirmation_required",
      capability: "messaging.send_reply",
    });
  });

  it("allows capabilities without metadata or config confirmation requirements", () => {
    expect(
      evaluateConfirmationPolicy(
        createFeature("messaging"),
        createCapability("messaging.draft_reply"),
        config,
      ),
    ).toBeUndefined();
  });
});

function createFeature(id: string): FeaturePlugin {
  return {
    id,
    displayName: id,
    capabilities: [],
    canHandle: () => false,
    execute: () => Promise.resolve({ text: "unused" }),
  };
}

function createCapability(name: string): FeatureCapability {
  return {
    name,
    risk: "low",
  };
}
