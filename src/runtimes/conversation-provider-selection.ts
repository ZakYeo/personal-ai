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
import type { CapabilityCatalog } from "../ports/capability-catalog.js";
import type {
  ConversationProviderDependencies,
  ConversationProviderRegistry,
  ParsedConversationConfig,
} from "./config/conversation-config.js";
import { parseOpenAIResponsesConfig } from "./config/openai-responses-config.js";
import {
  defineConfiglessRuntimeProvider,
  defineRuntimeProvider,
} from "./runtime-provider-registry.js";

export function createConfiguredConversation(
  config: { conversation: ParsedConversationConfig },
  features: FeaturePlugin[],
  capabilityCatalog: CapabilityCatalog,
  dependencies: ConversationProviderDependencies,
) {
  return config.conversation.resolvedProvider.create({
    capabilityCatalog,
    dependencies,
    features,
    history: config.conversation.history,
  });
}

export function createDefaultConversationProviderRegistry(): ConversationProviderRegistry {
  return {
    deterministic: defineConfiglessRuntimeProvider(({ history }) => {
      return {
        compactor: new DeterministicConversationCompactor(),
        history,
        responder: new DeterministicConversationResponder(),
      };
    }),
    disabled: defineConfiglessRuntimeProvider((): undefined => undefined),
    openai: defineRuntimeProvider({
      configKey: "openai",
      create: (
        providerConfig: OpenAIResponsesConfig,
        { capabilityCatalog, dependencies, history },
      ) => {
        const options = {
          capabilityCatalog,
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
    const combinedSummary = [
      state.summary,
      ...state.recentTurns.map(
        (turn) => `${turn.role}: ${withoutDeterministicSummaryEcho(turn)}`,
      ),
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");

    return Promise.resolve({
      recentTurns: [],
      summary: combinedSummary.slice(-maximumDeterministicSummaryCharacters),
    });
  }
}

const maximumDeterministicSummaryCharacters = 2_000;

function withoutDeterministicSummaryEcho(
  turn: ConversationState["recentTurns"][number],
): string {
  if (turn.role !== "assistant") {
    return turn.content;
  }

  return turn.content.split(". Summary: ", 1)[0] ?? turn.content;
}
