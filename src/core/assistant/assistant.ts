import type {
  AssistantPolicyConfig,
  AssistantCommand,
  AssistantContext,
  AssistantDiagnostic,
  AssistantOutcome,
  AssistantResponse,
  ClockPort,
} from "../../ports/assistant.js";
import type { FeaturePlugin } from "../../ports/feature.js";
import type { IntentInterpreterPort } from "../../ports/intent.js";
import type { ResponseRewriterPort } from "../../ports/response-rewriter.js";
import {
  createAppError,
  mapAppErrorToResponse,
  type AppError,
} from "./app-error.js";
import { decodeCommandForCapability } from "./command-validation.js";
import {
  createConversationSession,
  type ConversationSession,
  type ConversationSessionDependencies,
} from "./conversation-session.js";
import { evaluateConfirmationPolicy } from "./confirmation-policy.js";

export interface AssistantDependencies {
  clock: ClockPort;
  config: AssistantPolicyConfig;
  conversation?: ConversationSessionDependencies;
  features: FeaturePlugin[];
  intentInterpreter: IntentInterpreterPort;
  responseRewriter?: ResponseRewriterPort;
}

export interface Assistant {
  handleText(text: string): Promise<AssistantResponse>;
  handleTextWithDiagnostics(text: string): Promise<AssistantOutcome>;
}

export function createAssistant(
  dependencies: AssistantDependencies,
): Assistant {
  const conversation = dependencies.conversation
    ? createConversationSession(dependencies.conversation)
    : undefined;

  async function handleTextWithDiagnostics(
    text: string,
  ): Promise<AssistantOutcome> {
    return handleTextInternal(text, dependencies, conversation);
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
  conversation: ConversationSession | undefined,
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
    return handleConversation(normalizedText, context, conversation);
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

    const response: AssistantResponse = {
      status: "ok",
      text: result.text,
    };

    return rewriteCommandResponse({
      command,
      context,
      dependencies,
      response,
      text: normalizedText,
    });
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

async function rewriteCommandResponse(input: {
  command: AssistantCommand;
  context: AssistantContext;
  dependencies: AssistantDependencies;
  response: AssistantResponse;
  text: string;
}): Promise<AssistantOutcome> {
  const rewriter = input.dependencies.responseRewriter;

  if (!rewriter) {
    return {
      response: input.response,
    };
  }

  try {
    const rewrite = await rewriter.rewrite(
      {
        capability: input.command.capability,
        command: input.command,
        originalText: input.text,
        response: input.response,
      },
      input.context,
    );

    return {
      response: {
        ...input.response,
        text: rewrite.text,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown response rewrite error";

    return outcomeFromError(
      createAppError({
        category: "response_rewrite_failure",
        capability: input.command.capability,
        cause: error,
        message,
      }),
      input.response,
    );
  }
}

async function handleConversation(
  input: string,
  context: AssistantContext,
  conversation: ConversationSession | undefined,
): Promise<AssistantOutcome> {
  if (!conversation) {
    return {
      response: {
        status: "unknown",
        text: "I could not understand that command.",
      },
    };
  }

  try {
    const response = await conversation.respond(input, context);

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

function outcomeFromError(
  error: AppError,
  response: AssistantResponse = mapAppErrorToResponse(error),
): AssistantOutcome {
  const outcome: AssistantOutcome = {
    response,
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
