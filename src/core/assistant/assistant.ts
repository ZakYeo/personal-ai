import type {
  AssistantPolicyConfig,
  AssistantContext,
  AssistantDiagnostic,
  AssistantOutcome,
  AssistantResponse,
  ClockPort,
} from "../../ports/assistant.js";
import type {
  ConversationCompactorPort,
  ConversationHistoryConfig,
  ConversationResponderPort,
  ConversationState,
  ConversationTurn,
} from "../../ports/conversation.js";
import type { FeaturePlugin } from "../../ports/feature.js";
import type { IntentInterpreterPort } from "../../ports/intent.js";
import {
  createAppError,
  mapAppErrorToResponse,
  type AppError,
} from "./app-error.js";
import { decodeCommandForCapability } from "./command-validation.js";
import { evaluateConfirmationPolicy } from "./confirmation-policy.js";

export interface AssistantDependencies {
  clock: ClockPort;
  config: AssistantPolicyConfig;
  conversation?: {
    compactor: ConversationCompactorPort;
    history: ConversationHistoryConfig;
    responder: ConversationResponderPort;
  };
  features: FeaturePlugin[];
  intentInterpreter: IntentInterpreterPort;
}

export interface Assistant {
  handleText(text: string): Promise<AssistantResponse>;
  handleTextWithDiagnostics(text: string): Promise<AssistantOutcome>;
}

export function createAssistant(
  dependencies: AssistantDependencies,
): Assistant {
  const conversationState: ConversationState = {
    recentTurns: [],
  };

  async function handleTextWithDiagnostics(
    text: string,
  ): Promise<AssistantOutcome> {
    return handleTextInternal(text, dependencies, conversationState);
  }

  return {
    async handleText(text: string): Promise<AssistantResponse> {
      const outcome = await handleTextWithDiagnostics(text);

      return outcome.response;
    },
    handleTextWithDiagnostics,
  };
}

async function handleTextInternal(
  text: string,
  dependencies: AssistantDependencies,
  conversationState: ConversationState,
): Promise<AssistantOutcome> {
  const normalizedText = text.trim();

  if (normalizedText.length === 0) {
    return {
      response: {
        status: "unknown",
        text: "I need a command to help with.",
      },
    };
  }

  const context: AssistantContext = {
    clock: dependencies.clock,
    config: dependencies.config,
  };
  const interpretation = await dependencies.intentInterpreter.interpret(
    normalizedText,
    context,
  );

  if (
    interpretation.kind === "unknown" ||
    interpretation.kind === "unsupported"
  ) {
    return {
      response: interpretation.response,
    };
  }

  if (interpretation.kind === "conversation") {
    return handleConversation(
      normalizedText,
      dependencies,
      context,
      conversationState,
    );
  }

  const command = interpretation.command;
  const feature = dependencies.features.find(
    (candidate) =>
      isFeatureEnabled(candidate, dependencies.config) &&
      declaresCapability(candidate, command.capability) &&
      candidate.canHandle?.(command, context) !== false,
  );

  if (!feature) {
    return outcomeFromError(
      createAppError({
        category: "unsupported",
        capability: command.capability,
        message: `No enabled feature can handle ${command.capability}.`,
      }),
    );
  }

  try {
    const capability = feature.capabilities.find(
      (candidate) => candidate.name === command.capability,
    );

    if (!capability) {
      return outcomeFromError(
        createAppError({
          category: "unsupported",
          capability: command.capability,
          message: `${feature.id} does not declare ${command.capability}.`,
        }),
      );
    }

    const decodedCommand = decodeCommandForCapability(command, capability);

    if (!decodedCommand.ok) {
      return outcomeFromError(decodedCommand.error);
    }

    const confirmationError = evaluateConfirmationPolicy(
      feature,
      capability,
      dependencies.config,
    );

    if (confirmationError) {
      return outcomeFromError(confirmationError);
    }

    const result = await feature.execute(
      {
        capability: command.capability,
        command,
        args: decodedCommand.args,
      },
      context,
    );

    return {
      response: {
        status: "ok",
        text: result.text,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown feature error";

    return outcomeFromError(
      createAppError({
        category: "feature_failure",
        capability: command.capability,
        cause: error,
        message,
      }),
    );
  }
}

async function handleConversation(
  input: string,
  dependencies: AssistantDependencies,
  context: AssistantContext,
  conversationState: ConversationState,
): Promise<AssistantOutcome> {
  if (!dependencies.conversation) {
    return {
      response: {
        status: "unknown",
        text: "I could not understand that command.",
      },
    };
  }

  try {
    const response = await dependencies.conversation.responder.respond(
      input,
      cloneConversationState(conversationState),
      context,
    );

    conversationState.recentTurns.push(
      { content: input, role: "user" },
      { content: response.text, role: "assistant" },
    );

    await compactConversationIfNeeded(
      conversationState,
      dependencies.conversation,
      context,
    );

    return {
      response,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown conversation error";

    return outcomeFromError(
      createAppError({
        category: "conversation_failure",
        cause: error,
        message,
      }),
    );
  }
}

async function compactConversationIfNeeded(
  conversationState: ConversationState,
  conversation: NonNullable<AssistantDependencies["conversation"]>,
  context: AssistantContext,
): Promise<void> {
  if (
    countUserTurns(conversationState.recentTurns) <
    conversation.history.maxTurnsBeforeCompaction
  ) {
    return;
  }

  const compacted = await conversation.compactor.compact(
    cloneConversationState(conversationState),
    context,
  );

  if (compacted.summary) {
    conversationState.summary = compacted.summary;
  } else {
    delete conversationState.summary;
  }
  conversationState.recentTurns = [...compacted.recentTurns];
}

function countUserTurns(turns: ConversationTurn[]): number {
  return turns.filter((turn) => turn.role === "user").length;
}

function cloneConversationState(state: ConversationState): ConversationState {
  return {
    ...(state.summary ? { summary: state.summary } : {}),
    recentTurns: state.recentTurns.map((turn) => ({ ...turn })),
  };
}

function outcomeFromError(error: AppError): AssistantOutcome {
  const outcome: AssistantOutcome = {
    response: mapAppErrorToResponse(error),
  };

  if (
    error.cause !== undefined ||
    error.category === "feature_failure" ||
    error.category === "conversation_failure"
  ) {
    outcome.diagnostics = [toAssistantDiagnostic(error)];
  }

  return outcome;
}

function toAssistantDiagnostic(error: AppError): AssistantDiagnostic {
  return {
    category: error.category,
    message: error.message,
    ...(error.capability ? { capability: error.capability } : {}),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  };
}

function isFeatureEnabled(
  feature: FeaturePlugin,
  config: AssistantPolicyConfig,
): boolean {
  return config.features[feature.id]?.enabled === true;
}

function declaresCapability(
  feature: FeaturePlugin,
  capabilityName: string,
): boolean {
  return feature.capabilities.some(
    (capability) => capability.name === capabilityName,
  );
}
