import type { OpenAIIntentConfig } from "../../ports/assistant.js";
import { selectConfiguredRuntimeEntry } from "../runtime-selector.js";
import {
  isRecord,
  parseOptionalNonEmptyString,
  parseOptionalPositiveInteger,
} from "./config-parse-utils.js";

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
      openai: OpenAIIntentConfig;
      provider: "openai";
    };

export interface ConversationHistoryRuntimeConfig {
  maxTurnsBeforeCompaction: number;
}

export interface ParsedConversationConfig {
  history: ConversationHistoryRuntimeConfig;
  openai?: OpenAIIntentConfig;
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

  return {
    history: parseConversationHistoryConfig(value.history),
    provider: value.provider,
    ...parseOpenAIConversationConfig(value.openai),
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

function parseOpenAIConversationConfig(
  value: unknown,
): Pick<ParsedConversationConfig, "openai"> {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error("Config conversation.openai must be a JSON object.");
  }

  if (typeof value.model !== "string" || value.model.length === 0) {
    throw new Error(
      "Config conversation.openai.model must be a non-empty string.",
    );
  }

  return {
    openai: {
      apiKeyEnv: parseOptionalNonEmptyString(
        value.apiKeyEnv,
        "Config conversation.openai.apiKeyEnv must be a non-empty string.",
        "OPENAI_API_KEY",
      ),
      baseUrl: parseOptionalNonEmptyString(
        value.baseUrl,
        "Config conversation.openai.baseUrl must be a non-empty string.",
        "https://api.openai.com/v1",
      ),
      model: value.model,
      timeoutMs: parseOptionalPositiveInteger(
        value.timeoutMs,
        "Config conversation.openai.timeoutMs must be a positive integer.",
        30_000,
      ),
    },
  };
}
