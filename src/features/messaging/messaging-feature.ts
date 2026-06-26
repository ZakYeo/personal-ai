import type {
  FeatureExecutionRequest,
  FeaturePlugin,
  FeatureResult,
} from "../../ports/feature.js";

type MessagingDraftReplyRequest = FeatureExecutionRequest<
  "messaging.draft_reply",
  {
    channel?: string;
  }
>;

export function createMessagingFeature(): FeaturePlugin<MessagingDraftReplyRequest> {
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
    execute: (request) => Promise.resolve(draftReply(request.args)),
  };
}

function draftReply(args: MessagingDraftReplyRequest["args"]): FeatureResult {
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
