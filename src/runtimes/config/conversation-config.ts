import type { OpenAIResponsesConfig } from "../../adapters/openai/openai-responses-config.js";
import { selectConfiguredRuntimeEntry } from "../runtime-selector.js";
import {
  isRecord,
  parseOptionalPositiveInteger,
} from "./config-parse-utils.js";
import { parseOptionalOpenAIResponsesConfig } from "./openai-responses-config.js";

export type ResolvedConversationConfig =
  | {
      history: ConversationHistoryRuntimeConfig;
      provider: "disabled";
    }
  | {
      history: ConversationHistoryRuntimeConfig;
      provider: "deterministic";
    }
  | {
      history: ConversationHistoryRuntimeConfig;
      openai: OpenAIResponsesConfig;
      provider: "openai";
    };

export interface ConversationHistoryRuntimeConfig {
  maxTurnsBeforeCompaction: number;
}

export interface ParsedConversationConfig {
  history: ConversationHistoryRuntimeConfig;
  openai?: OpenAIResponsesConfig;
  provider: string;
}

export function parseConversationConfig(
  value: unknown,
): ParsedConversationConfig {
  if (value === undefined) {
    return {
      history: { maxTurnsBeforeCompaction: 5 },
      provider: "disabled",
    };
  }

  if (!isRecord(value)) {
    throw new Error("Config conversation must be a JSON object.");
  }

  if (typeof value.provider !== "string" || value.provider.length === 0) {
    throw new Error("Config conversation.provider must be a non-empty string.");
  }

  const openai = parseOptionalOpenAIResponsesConfig(
    value.openai,
    "Config conversation.openai",
  );

  return {
    history: parseConversationHistoryConfig(value.history),
    provider: value.provider,
    ...(openai ? { openai } : {}),
  };
}

export function requireConversationConfig(config: {
  conversation: ParsedConversationConfig;
}): ResolvedConversationConfig {
  const resolveConversation = selectConfiguredRuntimeEntry({
    configuredId: config.conversation.provider,
    missingMessage: "Config conversation.provider must be configured.",
    registry: {
      deterministic: () =>
        ({
          history: config.conversation.history,
          provider: "deterministic",
        }) as const,
      disabled: () =>
        ({
          history: config.conversation.history,
          provider: "disabled",
        }) as const,
      openai: () => {
        if (!config.conversation.openai) {
          throw new Error("Config conversation.openai must be configured.");
        }

        return {
          history: config.conversation.history,
          openai: config.conversation.openai,
          provider: "openai",
        } as const;
      },
    },
    unknownMessage: (provider) =>
      `Config conversation.provider "${provider}" is not registered.`,
  });

  return resolveConversation();
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
