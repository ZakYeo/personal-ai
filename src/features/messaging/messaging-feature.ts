import type { AssistantCommand } from "../../ports/assistant.js";
import type {
  FeatureArguments,
  FeaturePlugin,
  FeatureResult,
} from "../../ports/feature.js";

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
    execute: (_command: AssistantCommand, args: FeatureArguments) =>
      Promise.resolve(draftReply(args)),
  };
}

function draftReply(args: FeatureArguments): FeatureResult {
  const channel = typeof args.channel === "string" ? args.channel : "message";
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
