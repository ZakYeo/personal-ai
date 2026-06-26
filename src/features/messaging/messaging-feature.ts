import type { AssistantCommand } from "../../ports/assistant.js";
import type { FeaturePlugin, FeatureResult } from "../../ports/feature.js";

export function createMessagingFeature(): FeaturePlugin {
  return {
    id: "messaging",
    displayName: "Mock Messaging",
    capabilities: [
      {
        name: "messaging.draft_reply",
        risk: "low",
        parameters: {
          channel: { type: "string" },
        },
      },
    ],
    canHandle: (command: AssistantCommand) =>
      command.capability === "messaging.draft_reply",
    execute: (command: AssistantCommand) =>
      Promise.resolve(draftReply(command)),
  };
}

function draftReply(command: AssistantCommand): FeatureResult {
  const channel = String(command.parameters.channel ?? "message");
  const draft =
    "Thanks for the message. I will take a look and get back to you shortly.";

  return {
    text: `Drafted a ${channel} reply: "${draft}"`,
    data: {
      channel,
      draft,
      sent: false,
    },
  };
}
