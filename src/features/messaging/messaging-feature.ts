import type {
  FeatureArgsFromParameters,
  FeatureCapabilityParameters,
  FeaturePlugin,
  FeatureResult,
} from "../../ports/feature.js";
import {
  defineDeterministicFeatureRules,
  type DeterministicFeatureRule,
} from "../../ports/deterministic-feature-rules.js";
import { defineCapability, defineFeature } from "../../ports/feature.js";

const messagingDraftReplyParameters = {
  channel: { type: "string" },
} as const satisfies FeatureCapabilityParameters;

type MessagingDraftReplyArgs = FeatureArgsFromParameters<
  typeof messagingDraftReplyParameters
>;

const messagingDeterministicIntentRules: DeterministicFeatureRule[] = [
  {
    capability: "messaging.draft_reply",
    match: (text) =>
      text.includes("whatsapp") &&
      (text.includes("respond") ||
        text.includes("reply") ||
        text.includes("draft"))
        ? { channel: "whatsapp" }
        : undefined,
  },
];

export function createMessagingFeature(): FeaturePlugin {
  return defineDeterministicFeatureRules(
    defineFeature({
      id: "messaging",
      displayName: "Mock Messaging",
      capabilities: {
        "messaging.draft_reply": defineCapability({
          description:
            "Draft a reply for a configured messaging channel without sending it.",
          risk: "low",
          summary: "Draft a message reply without sending it.",
          parameters: messagingDraftReplyParameters,
          execute: (request) => draftReply(request.args),
        }),
      },
    }),
    messagingDeterministicIntentRules,
  );
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
