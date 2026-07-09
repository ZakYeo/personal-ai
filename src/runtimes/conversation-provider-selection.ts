import {
  OpenAIConversationCompactor,
  OpenAIConversationResponder,
} from "../adapters/openai/openai-conversation.js";
import type { AssistantDependencies } from "../core/assistant/index.js";
import type {
  ConversationCompactorPort,
  ConversationResponderPort,
  ConversationState,
} from "../ports/conversation.js";
import type { FeaturePlugin } from "../ports/feature.js";
import type { LoadedRuntimeConfig } from "./config/config.js";
import {
  requireConversationConfig,
  type ResolvedConversationConfig,
} from "./config/conversation-config.js";
import { createProviderCapabilityCatalog } from "./provider-capability-catalog.js";

interface ConversationProviderDependencies {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

type ConversationFactory<TConversation extends ResolvedConversationConfig> =
  (context: {
    config: LoadedRuntimeConfig;
    conversation: TConversation;
    dependencies: ConversationProviderDependencies;
    features: FeaturePlugin[];
  }) => AssistantDependencies["conversation"];

type ConversationProviderRegistry = {
  [TConversation in ResolvedConversationConfig as TConversation["provider"]]?: ConversationFactory<TConversation>;
};

interface CreateConfiguredConversationOptions {
  registry?: ConversationProviderRegistry;
}

export function createConfiguredConversation(
  config: LoadedRuntimeConfig,
  features: FeaturePlugin[],
  dependencies: ConversationProviderDependencies,
  options: CreateConfiguredConversationOptions = {},
): AssistantDependencies["conversation"] {
  const conversation = requireConversationConfig(config);
  const registry =
    options.registry ?? createDefaultConversationProviderRegistry();
  const factory = registry[conversation.provider] as
    | ConversationFactory<typeof conversation>
    | undefined;

  if (!factory) {
    throw new Error(
      `Conversation provider "${conversation.provider}" does not have a registered factory.`,
    );
  }

  return factory({
    config,
    conversation,
    dependencies,
    features,
  });
}

function createDefaultConversationProviderRegistry(): Required<ConversationProviderRegistry> {
  return {
    deterministic: ({ conversation }) => ({
      compactor: new DeterministicConversationCompactor(),
      history: conversation.history,
      responder: new DeterministicConversationResponder(),
    }),
    disabled: () => noConversation,
    openai: ({ conversation, dependencies, features }) => {
      const options = {
        capabilityCatalog: createProviderCapabilityCatalog(features),
        config: conversation.openai,
        env: dependencies.env,
        fetch: dependencies.fetch,
      };

      return {
        compactor: new OpenAIConversationCompactor(options),
        history: conversation.history,
        responder: new OpenAIConversationResponder(options),
      };
    },
  };
}

const noConversation: AssistantDependencies["conversation"] = undefined;

class DeterministicConversationResponder implements ConversationResponderPort {
  respond(input: string, state: ConversationState) {
    const summaryText = state.summary ? ` Summary: ${state.summary}` : "";

    return Promise.resolve({
      status: "ok" as const,
      text: `I can chat about "${input}".${summaryText}`,
    });
  }
}

class DeterministicConversationCompactor implements ConversationCompactorPort {
  compact(state: ConversationState) {
    return Promise.resolve({
      recentTurns: [],
      summary: [
        state.summary,
        ...state.recentTurns.map((turn) => `${turn.role}: ${turn.content}`),
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
    });
  }
}
