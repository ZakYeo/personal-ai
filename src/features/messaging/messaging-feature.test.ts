import { createMessagingFeature } from "./messaging-feature.js";
import {
  createFeatureContext,
  expectDecodedFeatureExecution,
  expectCapabilityMetadata,
  expectFeatureHandles,
} from "../../test-support/feature-contract.js";

const context = createFeatureContext();

describe("createMessagingFeature", () => {
  it("declares draft reply metadata", () => {
    expectCapabilityMetadata(createMessagingFeature(), {
      name: "messaging.draft_reply",
      risk: "low",
      parameters: {
        channel: { type: "string" },
      },
    });
  });

  it("handles messaging draft commands", () => {
    expectFeatureHandles(
      createMessagingFeature(),
      "messaging.draft_reply",
      "messaging.send_reply",
    );
  });

  it("creates a deterministic draft without sending", async () => {
    await expectDecodedFeatureExecution(
      createMessagingFeature(),
      "messaging.draft_reply",
      { channel: "whatsapp" },
      {
        text: 'Drafted a whatsapp reply: "Thanks for the message. I will take a look and get back to you shortly."',
        data: {
          channel: "whatsapp",
          draft:
            "Thanks for the message. I will take a look and get back to you shortly.",
          sent: false,
        },
      },
      context,
    );
  });
});
