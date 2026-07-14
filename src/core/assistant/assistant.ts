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
  ConfirmationDeclaration,
  FeatureArguments,
  FeatureCapability,
  FeaturePlugin,
} from "../../ports/feature.js";
import type { CapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type {
  ValidatedAssistantPlan,
  ValidatedAssistantPlanStep,
} from "../../ports/assistant-plan.js";
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
import {
  createConfirmationSession,
  type ConfirmationSession,
} from "./confirmation-session.js";
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
  const confirmation = createConfirmationSession();

  async function handleTextWithDiagnostics(
    text: string,
  ): Promise<AssistantOutcome> {
    return confirmation.run(text, () =>
      handleTextInternal(text, dependencies, conversation, confirmation),
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

  if (interpretation.kind === "plan") {
    return handleProposedPlan({
      commands: interpretation.plan.commands,
      context,
      dependencies,
      executionContext,
      normalizedText,
      confirmation,
    });
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
      const declaration = renderConfirmation(
        capability,
        decodedCommand.args,
        context,
      );
      if (capability.risk === "high" && !declaration) {
        return featureFailureOutcome(
          new Error(
            `${capability.name} requires a deterministic confirmation renderer.`,
          ),
          capability.name,
        );
      }
      return confirmation.request(
        () =>
          executeCommand({
            command,
            context,
            decodedArgs: decodedCommand.args,
            dependencies,
            executionContext,
            feature,
            normalizedText,
          }),
        declaration
          ? createConfirmationPrompt([declaration], false)
          : undefined,
      );
    }

    return executeCommand({
      command,
      context,
      decodedArgs: decodedCommand.args,
      dependencies,
      executionContext,
      feature,
      normalizedText,
    });
  } catch (error) {
    return featureFailureOutcome(error, command.capability);
  }
}

async function handleProposedPlan(input: {
  commands: readonly AssistantCommand[];
  confirmation: ConfirmationSession;
  context: AssistantContext;
  dependencies: AssistantDependencies;
  executionContext: AssistantContext & {
    capabilityCatalog: AssistantDependencies["capabilityRouting"]["catalog"];
  };
  normalizedText: string;
}): Promise<AssistantOutcome> {
  if (input.commands.length < 1 || input.commands.length > 3) {
    return outcomeFromError(
      createAppError({
        category: "validation",
        message: "A compound plan must contain one to three commands.",
      }),
    );
  }

  const steps: ValidatedAssistantPlanStep[] = [];
  let requiresConfirmation = false;

  for (const command of input.commands) {
    const route = input.dependencies.capabilityRouting.get(command.capability);
    const feature = route?.feature;

    if (
      !route ||
      !feature ||
      !isFeatureEnabled(feature, input.dependencies.config) ||
      feature.canHandle?.(command, input.context) === false
    ) {
      return outcomeFromError(
        createAppError({
          category: "unsupported",
          capability: command.capability,
          message: `No enabled feature can handle ${command.capability}.`,
        }),
      );
    }

    const decoded = decodeCommandForCapability(command, route.capability);
    if (!decoded.ok) {
      return outcomeFromError(decoded.error);
    }

    const confirmationRequired =
      evaluateConfirmationPolicy(
        feature,
        route.capability,
        input.dependencies.config,
      ) !== undefined;
    requiresConfirmation ||= confirmationRequired;
    const confirmation = confirmationRequired
      ? renderConfirmation(route.capability, decoded.args, input.context)
      : undefined;
    if (
      confirmationRequired &&
      route.capability.risk === "high" &&
      !confirmation
    ) {
      return featureFailureOutcome(
        new Error(
          `${route.capability.name} requires a deterministic confirmation renderer.`,
        ),
        route.capability.name,
      );
    }
    steps.push(
      Object.freeze({
        command: Object.freeze({
          ...command,
          parameters: Object.freeze({ ...command.parameters }),
        }),
        decodedArgs: Object.freeze({ ...decoded.args }),
        ...(confirmation ? { confirmation: Object.freeze(confirmation) } : {}),
        route,
      }),
    );
  }

  const validatedPlan: ValidatedAssistantPlan = Object.freeze({
    steps: Object.freeze(steps),
  });
  const execute = () =>
    executeValidatedPlan(validatedPlan, {
      context: input.context,
      dependencies: input.dependencies,
      executionContext: input.executionContext,
      normalizedText: input.normalizedText,
    });

  return requiresConfirmation
    ? input.confirmation.request(
        execute,
        createConfirmationPrompt(
          validatedPlan.steps.flatMap((step) =>
            step.confirmation ? [step.confirmation] : [],
          ),
          true,
        ),
      )
    : execute();
}

function renderConfirmation(
  capability: FeatureCapability,
  args: FeatureArguments,
  context: AssistantContext,
): ConfirmationDeclaration | undefined {
  const declaration = capability.renderConfirmation?.(args, context);

  return declaration
    ? {
        facts: Object.freeze({ ...declaration.facts }),
        text: declaration.text,
      }
    : undefined;
}

function createConfirmationPrompt(
  declarations: readonly ConfirmationDeclaration[],
  plan: boolean,
): AssistantOutcome {
  if (declarations.length === 0) {
    return {
      response: {
        expectsFollowUp: true,
        status: "needs_confirmation",
        text: "I need confirmation before doing that. Please confirm yes or no.",
      },
    };
  }

  const actions = declarations
    .map((declaration, index) => `${index + 1}. ${declaration.text}.`)
    .join(" ");

  return {
    response: {
      expectsFollowUp: true,
      status: "needs_confirmation",
      text: `${plan ? "Please confirm this plan" : "Please confirm"}: ${actions} Say yes or no.`,
    },
  };
}

async function executeValidatedPlan(
  plan: ValidatedAssistantPlan,
  input: {
    context: AssistantContext;
    dependencies: AssistantDependencies;
    executionContext: AssistantContext & {
      capabilityCatalog: AssistantDependencies["capabilityRouting"]["catalog"];
    };
    normalizedText: string;
  },
): Promise<AssistantOutcome> {
  const { steps } = plan;
  const stepOutcomes: NonNullable<AssistantOutcome["plan"]>["steps"][number][] =
    [];
  let failed = false;

  for (const step of steps) {
    if (failed) {
      stepOutcomes.push({
        capability: step.command.capability,
        status: "skipped",
      });
      continue;
    }

    const outcome = await executeCommand({
      command: step.command,
      context: input.context,
      decodedArgs: step.decodedArgs,
      dependencies: input.dependencies,
      executionContext: input.executionContext,
      feature: step.route.feature,
      normalizedText: input.normalizedText,
    });
    const succeeded = outcome.response.status === "ok";
    failed = !succeeded;
    stepOutcomes.push({
      capability: step.command.capability,
      ...(outcome.diagnostics ? { diagnostics: outcome.diagnostics } : {}),
      response: outcome.response,
      status: succeeded ? "succeeded" : "failed",
    });
  }

  const completedText = stepOutcomes
    .flatMap((step) =>
      step.status === "succeeded" && step.response ? [step.response.text] : [],
    )
    .join(" ");
  const failedIndex = stepOutcomes.findIndex(
    (step) => step.status === "failed",
  );
  const failedStep = stepOutcomes[failedIndex];
  const skippedActions = stepOutcomes.flatMap((step, index) =>
    step.status === "skipped" ? [formatPlanAction(steps[index]!)] : [],
  );
  const response = failedStep
    ? {
        status: "error" as const,
        text: [
          completedText,
          `I could not complete this step: ${formatPlanAction(steps[failedIndex]!)}.`,
          skippedActions.length > 0
            ? `I did not attempt ${skippedActions.length === 1 ? "this remaining step" : "these remaining steps"}: ${skippedActions.join("; ")}.`
            : undefined,
        ]
          .filter((part): part is string => Boolean(part))
          .join(" "),
      }
    : { status: "ok" as const, text: completedText };
  const diagnostics = stepOutcomes.flatMap((step) => step.diagnostics ?? []);

  return {
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    plan: { steps: stepOutcomes },
    response,
  };
}

function formatPlanAction(step: ValidatedAssistantPlanStep): string {
  return (
    step.route.capability.summary?.replace(/\.$/u, "") ??
    step.route.feature.displayName
  );
}

async function executeCommand(input: {
  command: AssistantCommand;
  context: AssistantContext;
  decodedArgs: FeatureArguments;
  dependencies: AssistantDependencies;
  executionContext: AssistantContext & {
    capabilityCatalog: AssistantDependencies["capabilityRouting"]["catalog"];
  };
  feature: FeaturePlugin;
  normalizedText: string;
}): Promise<AssistantOutcome> {
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
      status: "ok",
      text: result.text,
    };

    return rewriteCommandResponse({
      command: input.command,
      context: input.context,
      dependencies: input.dependencies,
      facts: result.data ?? {},
      response,
      text: input.normalizedText,
    });
  } catch (error) {
    return featureFailureOutcome(error, input.command.capability);
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

function isFeatureEnabled(
  feature: FeaturePlugin,
  config: AssistantPolicyConfig,
): boolean {
  return config.features[feature.id]?.enabled === true;
}
