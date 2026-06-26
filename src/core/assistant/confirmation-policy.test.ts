import { evaluateConfirmationPolicy } from "./confirmation-policy.js";
import type { FeatureCapability, FeaturePlugin } from "../../ports/feature.js";
import {
  createFeature as createTestFeature,
  createAssistantConfig,
} from "../../test-support/core-assistant.js";

const config = createAssistantConfig({
  alarms: {
    enabled: true,
    confirmationRequiredCapabilities: ["alarm.create"],
  },
  messaging: { enabled: true },
});

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

  it("requires confirmation for all high-risk capabilities", () => {
    expect(
      evaluateConfirmationPolicy(
        createFeature("alarms"),
        {
          ...createCapability("alarm.create"),
          risk: "high",
        },
        createAssistantConfig({
          alarms: { enabled: true },
        }),
      ),
    ).toMatchObject({
      category: "confirmation_required",
      capability: "alarm.create",
    });
  });

  it("does not allow capability metadata to opt high-risk capabilities out of confirmation", () => {
    expect(
      evaluateConfirmationPolicy(
        createFeature("alarms"),
        {
          ...createCapability("alarm.create"),
          requiresConfirmation: false,
          risk: "high",
        },
        createAssistantConfig({
          alarms: { enabled: true },
        }),
      ),
    ).toMatchObject({
      category: "confirmation_required",
      capability: "alarm.create",
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
  return createTestFeature({
    id,
    displayName: id,
  });
}

function createCapability(name: string): FeatureCapability {
  return {
    name,
    risk: "low",
  };
}
