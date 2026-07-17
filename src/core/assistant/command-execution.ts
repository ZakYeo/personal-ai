import type {
  AssistantCommand,
  AssistantContext,
  AssistantOutcome,
  AssistantPolicyConfig,
  AssistantResponse,
  ClockPort,
} from "../../ports/assistant.js";
import type { ValidatedAssistantPlan } from "../../ports/assistant-plan.js";
import type { CapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type {
  FeatureArguments,
  FeatureExecutionContext,
  FeaturePlugin,
} from "../../ports/feature.js";
import type { ResponseRewriterPort } from "../../ports/response-rewriter.js";
import type { ResultReferenceSelectionRequest } from "../../ports/result-reference.js";
import { createAppError } from "./app-error.js";
import { outcomeFromError } from "./assistant-outcome.js";
import { planRequiresConfirmation } from "./plan-confirmation.js";
import {
  executeAssistantPlan,
  type CommandExecutionOutcome,
} from "./plan-execution.js";
import { protectResponseFacts } from "./response-fact-protection.js";
import type { ResultReferenceSession } from "./result-reference-session.js";

interface CommandExecutionDependencies {
  capabilityRouting: CapabilityRoutingIndex<FeaturePlugin>;
  clock: ClockPort;
  config: AssistantPolicyConfig;
  responseRewriter?: ResponseRewriterPort;
}

interface CommandExecutionInput {
  command: AssistantCommand;
  context: AssistantContext;
  decodedArgs: FeatureArguments;
  dependencies: CommandExecutionDependencies;
  executionContext: FeatureExecutionContext;
  feature: FeaturePlugin;
  normalizedText: string;
  onReferencesRetained: () => void;
  resultReferences: ResultReferenceSession;
}

export function executeValidatedPlan(
  plan: ValidatedAssistantPlan,
  dependencies: CommandExecutionDependencies,
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
  return executeAssistantPlan(plan, (step) =>
    executeCommand({
      command: step.command,
      context,
      decodedArgs: step.decodedArgs,
      dependencies,
      executionContext: createFeatureExecutionContext(
        context,
        dependencies,
        resultReferences,
        plan.originalText,
        step.confirmation.required
          ? step.confirmation.declaration.facts
          : undefined,
      ),
      feature: step.route.feature,
      normalizedText: plan.originalText,
      onReferencesRetained,
      resultReferences,
    }),
  );
}

export function executeWorkflowRead(input: {
  context: AssistantContext;
  dependencies: CommandExecutionDependencies;
  normalizedText: string;
  onReferencesRetained: () => void;
  resultReferences: ResultReferenceSession;
  step: Parameters<typeof executeAssistantPlan>[0]["steps"][number];
}): Promise<CommandExecutionOutcome> {
  return executeFeatureCommand({
    command: input.step.command,
    context: createTrustedCommandContext(
      input.context,
      input.resultReferences,
      input.normalizedText,
    ),
    decodedArgs: input.step.decodedArgs,
    dependencies: input.dependencies,
    executionContext: createFeatureExecutionContext(
      input.context,
      input.dependencies,
      input.resultReferences,
      input.normalizedText,
    ),
    feature: input.step.route.feature,
    normalizedText: input.normalizedText,
    onReferencesRetained: input.onReferencesRetained,
    resultReferences: input.resultReferences,
  });
}

export function createTrustedCommandContext(
  context: AssistantContext,
  resultReferences: ResultReferenceSession,
  trustedInputText: string,
): AssistantContext {
  const publicReferences = resultReferences.publicReferences();
  return {
    ...context,
    ...(publicReferences.length > 0
      ? {
          selectResultReference: (request: ResultReferenceSelectionRequest) =>
            resultReferences.select(request),
          trustedInputText,
        }
      : {}),
  };
}

function createFeatureExecutionContext(
  context: AssistantContext,
  dependencies: CommandExecutionDependencies,
  resultReferences: ResultReferenceSession,
  trustedInputText: string,
  validatedConfirmationFacts?: Readonly<AssistantCommand["parameters"]>,
): FeatureExecutionContext {
  return {
    ...createTrustedCommandContext(context, resultReferences, trustedInputText),
    capabilityCatalog: dependencies.capabilityRouting.catalog,
    ...(validatedConfirmationFacts ? { validatedConfirmationFacts } : {}),
  };
}

async function executeCommand(
  input: CommandExecutionInput,
): Promise<CommandExecutionOutcome> {
  const execution = await executeFeatureCommand(input);
  if (execution.outcome.response.status !== "ok") return execution;

  return {
    ...execution,
    outcome: await rewriteCommandResponse({
      command: input.command,
      context: input.context,
      dependencies: input.dependencies,
      facts: execution.data ?? {},
      response: execution.outcome.response,
      text: input.normalizedText,
    }),
  };
}

async function executeFeatureCommand(
  input: CommandExecutionInput,
): Promise<CommandExecutionOutcome> {
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
    return {
      ...(result.data ? { data: Object.freeze({ ...result.data }) } : {}),
      outcome: { response },
    };
  } catch (error) {
    return {
      outcome: outcomeFromError(
        createAppError({
          category: "feature_failure",
          capability: input.command.capability,
          cause: error,
          message:
            error instanceof Error ? error.message : "Unknown feature error",
        }),
      ),
    };
  }
}

async function rewriteCommandResponse(input: {
  command: AssistantCommand;
  context: AssistantContext;
  dependencies: CommandExecutionDependencies;
  facts: AssistantCommand["parameters"];
  response: AssistantResponse;
  text: string;
}): Promise<AssistantOutcome> {
  const rewriter = input.dependencies.responseRewriter;
  if (!rewriter) return { response: input.response };

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
        response: { ...input.response, text: protectedResponse.text },
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
    return outcomeFromError(
      createAppError({
        category: "response_rewrite_failure",
        capability: input.command.capability,
        cause: error,
        message:
          error instanceof Error
            ? error.message
            : "Unknown response rewrite error",
      }),
      input.response,
    );
  }
}
