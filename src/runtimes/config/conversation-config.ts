import type {
  ConversationCompactorPort,
  ConversationResponderPort,
} from "../../ports/conversation.js";
import type { FeaturePlugin } from "../../ports/feature.js";
import type { CapabilityCatalog } from "../../ports/capability-catalog.js";
import {
  resolveConfiguredRuntimeProvider,
  type ResolvedRuntimeProvider,
  type RuntimeProviderEntry,
} from "../runtime-provider-registry.js";
import {
  isRecord,
  parseOptionalPositiveInteger,
} from "./config-parse-utils.js";

export interface ConversationHistoryRuntimeConfig {
  maxTurnsBeforeCompaction: number;
}

export interface ConversationProviderDependencies {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

export interface ConversationProviderContext {
  capabilityCatalog: CapabilityCatalog;
  dependencies: ConversationProviderDependencies;
  features: FeaturePlugin[];
  history: ConversationHistoryRuntimeConfig;
}

export interface ConfiguredConversation {
  compactor: ConversationCompactorPort;
  history: ConversationHistoryRuntimeConfig;
  responder: ConversationResponderPort;
}

export type ConversationProviderRegistry = Record<
  string,
  RuntimeProviderEntry<
    ConversationProviderContext,
    ConfiguredConversation | undefined
  >
>;

export interface ParsedConversationConfig {
  history: ConversationHistoryRuntimeConfig;
  provider: string;
  resolvedProvider: ResolvedRuntimeProvider<
    ConversationProviderContext,
    ConfiguredConversation | undefined
  >;
}

export function parseConversationConfig(
  value: unknown,
  registry: ConversationProviderRegistry,
): ParsedConversationConfig {
  const rawConversation = value ?? { provider: "disabled" };

  if (!isRecord(rawConversation)) {
    throw new Error("Config conversation must be a JSON object.");
  }

  if (
    typeof rawConversation.provider !== "string" ||
    rawConversation.provider.length === 0
  ) {
    throw new Error("Config conversation.provider must be a non-empty string.");
  }

  const history = parseConversationHistoryConfig(rawConversation.history);

  return {
    history,
    provider: rawConversation.provider,
    resolvedProvider: resolveConfiguredRuntimeProvider({
      configuredId: rawConversation.provider,
      operationName: "conversation",
      rawOperationConfig: rawConversation,
      registry,
    }),
  };
}

function parseConversationHistoryConfig(
  value: unknown,
): ConversationHistoryRuntimeConfig {
  if (value === undefined) {
    return { maxTurnsBeforeCompaction: 5 };
  }

  if (!isRecord(value)) {
    throw new Error("Config conversation.history must be a JSON object.");
  }

  return {
    maxTurnsBeforeCompaction: parseOptionalPositiveInteger(
      value.maxTurnsBeforeCompaction,
      "Config conversation.history.maxTurnsBeforeCompaction must be a positive integer.",
      5,
    ),
  };
}
