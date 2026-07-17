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
import type {
  FeatureArguments,
  FeatureExecutionContext,
  FeaturePlugin,
} from "../../ports/feature.js";
import type { CapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type { ValidatedAssistantPlan } from "../../ports/assistant-plan.js";
import type { IntentInterpreterPort } from "../../ports/intent.js";
import type { ResponseRewriterPort } from "../../ports/response-rewriter.js";
import {
  createAppError,
  mapAppErrorToResponse,
  type AppError,
} from "./app-error.js";
import {
  createConversationSession,
  type ConversationSession,
  type ConversationSessionDependencies,
} from "./conversation-session.js";
import {
  createConfirmationSession,
  type ConfirmationSession,
} from "./confirmation-session.js";
import {
  createPlanConfirmationPrompt,
  planRequiresConfirmation,
} from "./plan-confirmation.js";
import {
  executeAssistantPlan,
  type CommandExecutionOutcome,
} from "./plan-execution.js";
import { validateAssistantPlan } from "./plan-validation.js";
import { protectResponseFacts } from "./response-fact-protection.js";
import { createResultReferenceSession } from "./result-reference-session.js";
import type { ResultReferenceSession } from "./result-reference-session.js";
import type { ResultReferenceSelectionRequest } from "../../ports/result-reference.js";

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
  const resultReferences = createResultReferenceSession();
  const conversation = dependencies.conversation
    ? createConversationSession({
        ...dependencies.conversation,
        onCompacted: () => resultReferences.clear(),
      })
    : undefined;
  const confirmation = createConfirmationSession();

  async function handleTextWithDiagnostics(
    text: string,
  ): Promise<AssistantOutcome> {
    let retainedReferences = false;
    return confirmation.run(
      text,
      () =>
        handleTextInternal(
          text,
          dependencies,
          conversation,
          confirmation,
          resultReferences,
          () => {
            retainedReferences = true;
          },
        ),
      (plan) =>
        executeValidatedPlan(plan, dependencies, resultReferences, () => {
          retainedReferences = true;
        }),
      () => {
        if (!retainedReferences) resultReferences.completeTurn();
      },
    );
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
  confirmation: ConfirmationSession,
  resultReferences: ResultReferenceSession,
  onReferencesRetained: () => void,
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
    ...(resultReferences.publicReferences().length > 0
      ? { resultReferences: resultReferences.publicReferences() }
      : {}),
  };
  const session = dependencies.intentInterpreter.start?.(
    normalizedText,
    context,
  );
  const interpretation = session
    ? await session.next()
    : await dependencies.intentInterpreter.interpret(normalizedText, context);

  if (
    interpretation.kind === "unknown" ||
    interpretation.kind === "unsupported" ||
    interpretation.kind === "clarification"
  ) {
    return {
      response: interpretation.response,
    };
  }

  if (interpretation.kind === "conversation") {
    return handleConversation(normalizedText, context, conversation);
  }

  if (interpretation.kind === "tool_call") {
    return {
      diagnostics: [
        {
          category: "unsupported",
          message: "Tool-chain execution is not enabled.",
          capability: interpretation.call.command.capability,
        },
      ],
      response: {
        status: "unsupported",
        text: "I cannot complete that chained request yet.",
      },
    };
  }

  const commands =
    interpretation.kind === "plan"
      ? interpretation.plan.commands
      : [interpretation.command];
  const validation = validateAssistantPlan({
    capabilityRouting: dependencies.capabilityRouting,
    commands,
    config: dependencies.config,
    context,
    kind: interpretation.kind === "plan" ? "compound" : "single",
    originalText: normalizedText,
  });

  if (!validation.ok) {
    return outcomeFromError(validation.error);
  }

  if (planRequiresConfirmation(validation.plan)) {
    return confirmation.request(
      validation.plan,
      createPlanConfirmationPrompt(validation.plan),
    );
  }

  return executeValidatedPlan(
    validation.plan,
    dependencies,
    resultReferences,
    onReferencesRetained,
  );
}

function executeValidatedPlan(
  plan: ValidatedAssistantPlan,
  dependencies: AssistantDependencies,
  resultReferences: ResultReferenceSession,
  onReferencesRetained: () => void,
): Promise<AssistantOutcome> {
  const context: AssistantContext = {
    clock: planRequiresConfirmation(plan)
      ? { now: () => new Date(plan.validatedAt) }
      : dependencies.clock,
    config: dependencies.config,
    ...(resultReferences.publicReferences().length > 0
      ? { resultReferences: resultReferences.publicReferences() }
      : {}),
  };
  const publicReferences = resultReferences.publicReferences();
  const executionContext = {
    ...context,
    capabilityCatalog: dependencies.capabilityRouting.catalog,
    ...(publicReferences.length > 0
      ? {
          selectResultReference: (request: ResultReferenceSelectionRequest) =>
            resultReferences.select(request),
          trustedInputText: plan.originalText,
        }
      : {}),
  };

  return executeAssistantPlan(plan, (step) =>
    executeCommand({
      command: step.command,
      context,
      decodedArgs: step.decodedArgs,
      dependencies,
      executionContext,
      feature: step.route.feature,
      normalizedText: plan.originalText,
      onReferencesRetained,
      resultReferences,
    }),
  );
}

async function executeCommand(input: {
  command: AssistantCommand;
  context: AssistantContext;
  decodedArgs: FeatureArguments;
  dependencies: AssistantDependencies;
  executionContext: FeatureExecutionContext;
  feature: FeaturePlugin;
  normalizedText: string;
  onReferencesRetained: () => void;
  resultReferences: ResultReferenceSession;
}): Promise<CommandExecutionOutcome> {
  try {
    const result = await input.feature.execute(
      {
        capability: input.command.capability,
        command: input.command,
        args: input.decodedArgs,
      },
      input.executionContext,
    );

    const response: AssistantResponse = {
      ...(result.expectsFollowUp ? { expectsFollowUp: true } : {}),
      status: "ok",
      text: result.text,
    };

    if (result.resultReferences) {
      input.resultReferences.retain(result.resultReferences);
      input.onReferencesRetained();
    }

    const outcome = await rewriteCommandResponse({
      command: input.command,
      context: input.context,
      dependencies: input.dependencies,
      facts: result.data ?? {},
      response,
      text: input.normalizedText,
    });

    return {
      ...(result.data ? { data: Object.freeze({ ...result.data }) } : {}),
      outcome,
    };
  } catch (error) {
    return {
      outcome: featureFailureOutcome(error, input.command.capability),
    };
  }
}

function featureFailureOutcome(
  error: unknown,
  capability: string,
): AssistantOutcome {
  const message =
    error instanceof Error ? error.message : "Unknown feature error";

  return outcomeFromError(
    createAppError({
      category: "feature_failure",
      capability,
      cause: error,
      message,
    }),
  );
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
