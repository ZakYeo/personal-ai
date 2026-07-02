import type {
  DeterministicFeatureRule,
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
  return defineFeature({
    id: "messaging",
    displayName: "Mock Messaging",
    capabilities: {
      "messaging.draft_reply": defineCapability({
        risk: "low",
        parameters: messagingDraftReplyParameters,
        deterministicRules: deterministicRulesFor("messaging.draft_reply"),
        execute: (request) => draftReply(request.args),
      }),
    },
  });
}

function deterministicRulesFor(capability: string) {
  return messagingDeterministicIntentRules
    .filter((rule) => rule.capability === capability)
    .map((rule) => rule.match);
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
