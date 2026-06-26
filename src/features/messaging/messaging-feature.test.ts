import { createMessagingFeature } from "./messaging-feature.js";
import type {
  AssistantCommand,
  AssistantContext,
} from "../../ports/assistant.js";

const context: AssistantContext = {
  clock: {
    now: () => new Date("2026-06-26T09:00:00.000Z"),
  },
  config: {
    assistant: {
      name: "Jarvis",
      wakePhrases: ["hey jarvis"],
    },
    features: {},
  },
};

describe("createMessagingFeature", () => {
  it("handles messaging draft commands", () => {
    const feature = createMessagingFeature();

    expect(
      feature.canHandle(createCommand("messaging.draft_reply"), context),
    ).toBe(true);
    expect(
      feature.canHandle(createCommand("messaging.send_reply"), context),
    ).toBe(false);
  });

  it("creates a deterministic draft without sending", async () => {
    const feature = createMessagingFeature();

    await expect(
      feature.execute(
        createCommand("messaging.draft_reply", { channel: "whatsapp" }),
        context,
      ),
    ).resolves.toEqual({
      text: 'Drafted a whatsapp reply: "Thanks for the message. I will take a look and get back to you shortly."',
      data: {
        channel: "whatsapp",
        draft:
          "Thanks for the message. I will take a look and get back to you shortly.",
        sent: false,
      },
    });
  });
});

function createCommand(
  capability: string,
  parameters: AssistantCommand["parameters"] = {},
): AssistantCommand {
  return {
    capability,
    parameters,
    rawText: "fixture",
  };
}
