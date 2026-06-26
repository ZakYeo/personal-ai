import type {
  FeatureArgsFromParameters,
  FeatureCapabilityParameters,
  FeaturePlugin,
  FeatureResult,
} from "../../ports/feature.js";
import { defineCapability, defineFeature } from "../../ports/feature.js";

const messagingDraftReplyParameters = {
  channel: { type: "string" },
} as const satisfies FeatureCapabilityParameters;

type MessagingDraftReplyArgs = FeatureArgsFromParameters<
  typeof messagingDraftReplyParameters
>;

export function createMessagingFeature(): FeaturePlugin {
  return defineFeature({
    id: "messaging",
    displayName: "Mock Messaging",
    capabilities: {
      "messaging.draft_reply": defineCapability({
        risk: "low",
        parameters: messagingDraftReplyParameters,
        execute: (request) => draftReply(request.args),
      }),
    },
  });
}

function draftReply(args: MessagingDraftReplyArgs): FeatureResult {
  const channel = args.channel ?? "message";
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
