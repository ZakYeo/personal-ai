import type {
  AssistantPolicyConfig,
  AssistantCommand,
  AssistantContext,
  AssistantDiagnostic,
  AssistantDiagnosticCategory,
  AssistantOutcome,
  AssistantResponse,
  ClockPort,
} from "../../ports/assistant.js";
import type { FeaturePlugin } from "../../ports/feature.js";
import type { CapabilityRoutingIndex } from "../../ports/capability-catalog.js";
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
import { protectResponseFacts } from "./response-fact-protection.js";

export interface AssistantDependencies {
  capabilityRouting: CapabilityRoutingIndex<FeaturePlugin>;
  clock: ClockPort;
  config: AssistantPolicyConfig;
  conversation?: ConversationSessionDependencies;
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
  const executionContext = {
    ...context,
    capabilityCatalog: dependencies.capabilityRouting.catalog,
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
  const route = dependencies.capabilityRouting.get(command.capability);
  const feature = route?.feature;

  if (
    !route ||
    !feature ||
    !isFeatureEnabled(feature, dependencies.config) ||
    feature.canHandle?.(command, context) === false
  ) {
    return outcomeFromError(
      createAppError({
        category: "unsupported",
        capability: command.capability,
        message: `No enabled feature can handle ${command.capability}.`,
      }),
    );
  }

  try {
    const capability = route.capability;

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
      executionContext,
    );

    const response: AssistantResponse = {
      status: "ok",
      text: result.text,
    };

    return rewriteCommandResponse({
      command,
      context,
      dependencies,
      facts: result.data ?? {},
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
  facts: AssistantCommand["parameters"];
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
    const protectedResponse = protectResponseFacts(
      input.response.text,
      input.facts,
      input.context.clock.now(),
    );
    const rewrite = await rewriter.rewrite(
      {
        capability: input.command.capability,
        command: input.command,
        originalText: input.text,
        ...(protectedResponse.facts.length > 0
          ? { protectedFacts: protectedResponse.facts }
          : {}),
        response: {
          ...input.response,
          text: protectedResponse.text,
        },
      },
      input.context,
    );

    return {
      response: {
        ...input.response,
        text: protectedResponse.restore(rewrite.text),
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

  if (diagnosticPolicy[error.category]) {
    outcome.diagnostics = [toAssistantDiagnostic(error)];
  }

  return outcome;
}

const diagnosticPolicy = {
  confirmation_required: false,
  conversation_failure: true,
  feature_failure: true,
  response_rewrite_failure: true,
  unexpected: true,
  unsupported: false,
  validation: false,
} as const satisfies Record<AssistantDiagnosticCategory, boolean>;

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
