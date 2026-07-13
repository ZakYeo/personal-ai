import {
  OpenAIConversationCompactor,
  OpenAIConversationResponder,
} from "../adapters/openai/openai-conversation.js";
import type { OpenAIResponsesConfig } from "../adapters/openai/openai-responses-config.js";
import type {
  ConversationCompactorPort,
  ConversationResponderPort,
  ConversationState,
} from "../ports/conversation.js";
import type { FeaturePlugin } from "../ports/feature.js";
import type {
  ConversationProviderDependencies,
  ConversationProviderRegistry,
  ParsedConversationConfig,
} from "./config/conversation-config.js";
import { parseOpenAIResponsesConfig } from "./config/openai-responses-config.js";
import { createProviderCapabilityCatalog } from "./provider-capability-catalog.js";
import { defineRuntimeProvider } from "./runtime-provider-registry.js";

export function createConfiguredConversation(
  config: { conversation: ParsedConversationConfig },
  features: FeaturePlugin[],
  dependencies: ConversationProviderDependencies,
) {
  return config.conversation.resolvedProvider.create({
    dependencies,
    features,
    history: config.conversation.history,
  });
}

export function createDefaultConversationProviderRegistry(): ConversationProviderRegistry {
  return {
    deterministic: defineRuntimeProvider({
      create: (providerConfig: void, { history }) => {
        void providerConfig;

        return {
          compactor: new DeterministicConversationCompactor(),
          history,
          responder: new DeterministicConversationResponder(),
        };
      },
      parseConfig: () => {},
    }),
    disabled: defineRuntimeProvider({
      create: (providerConfig: void): undefined => {
        void providerConfig;

        return;
      },
      parseConfig: () => {},
    }),
    openai: defineRuntimeProvider({
      configKey: "openai",
      create: (
        providerConfig: OpenAIResponsesConfig,
        { dependencies, features, history },
      ) => {
        const options = {
          capabilityCatalog: createProviderCapabilityCatalog(features),
          config: providerConfig,
          env: dependencies.env,
          fetch: dependencies.fetch,
        };

        return {
          compactor: new OpenAIConversationCompactor(options),
          history,
          responder: new OpenAIConversationResponder(options),
        };
      },
      parseConfig: (value) =>
        parseOpenAIResponsesConfig(value, "Config conversation.openai"),
    }),
  };
}

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
