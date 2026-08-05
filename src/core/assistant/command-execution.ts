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
  FeatureSpokenTextContext,
} from "../../ports/feature.js";
import type { ResponseRewriterPort } from "../../ports/response-rewriter.js";
import type { AssistantPersonalization } from "../../ports/personal-context.js";
import type {
  AssistantResultReference,
  ResultReferenceSelectionRequest,
} from "../../ports/result-reference.js";
import { humanizeSpokenText } from "../../application/human-text.js";
import { assertFeatureResponseTextWithinLimit } from "../../application/assistant-text-policy.js";
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
  resultReferences: ResultReferenceSession;
  requestClarification?: (
    response: AssistantResponse,
    metadata: {
      capability: string;
      parameter: string;
    },
  ) => AssistantOutcome;
}

interface ValidatedPlanExecutionOptions {
  personalization?: AssistantPersonalization;
  requestClarification?: CommandExecutionInput["requestClarification"];
}

export function executeValidatedPlan(
  plan: ValidatedAssistantPlan,
  dependencies: CommandExecutionDependencies,
  resultReferences: ResultReferenceSession,
  signal?: AbortSignal,
  options: ValidatedPlanExecutionOptions = {},
): Promise<AssistantOutcome> {
  const context: AssistantContext = {
    clock: planRequiresConfirmation(plan)
      ? { now: () => new Date(plan.validatedAt) }
      : dependencies.clock,
    config: dependencies.config,
    ...(options.personalization
      ? { personalization: options.personalization }
      : {}),
    ...(signal ? { signal } : {}),
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
      resultReferences,
      ...(plan.kind === "single" && options.requestClarification
        ? { requestClarification: options.requestClarification }
        : {}),
    }),
  );
}

export async function executeWorkflowRead(input: {
  context: AssistantContext;
  dependencies: CommandExecutionDependencies;
  normalizedText: string;
  resultReferences: ResultReferenceSession;
  step: Parameters<typeof executeAssistantPlan>[0]["steps"][number];
}): Promise<CommandExecutionOutcome> {
  const execution = await executeFeatureCommand({
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
    resultReferences: input.resultReferences,
  });
  if (
    execution.kind === "resumable_clarification" ||
    execution.outcome.response.status !== "ok"
  ) {
    return execution;
  }
  return {
    ...execution,
    outcome: {
      ...execution.outcome,
      response: prepareCommandResponse(
        execution.outcome.response,
        execution.data ?? {},
        input.context,
        execution.spokenText,
      ).restore(),
    },
  };
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
  if (execution.kind === "resumable_clarification") return execution;
  if (execution.outcome.response.status !== "ok") return execution;

  if (execution.responseRewrite === "disabled") {
    return {
      ...execution,
      outcome: {
        ...execution.outcome,
        response: prepareCommandResponse(
          execution.outcome.response,
          execution.data ?? {},
          input.context,
          execution.spokenText,
        ).restore(),
      },
    };
  }

  return {
    ...execution,
    outcome: await rewriteCommandResponse({
      command: input.command,
      context: input.context,
      dependencies: input.dependencies,
      facts: execution.data ?? {},
      response: execution.outcome.response,
      ...(execution.spokenText ? { spokenText: execution.spokenText } : {}),
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
    assertFeatureResponseTextWithinLimit(result.text);
    if (result.toolClarification) {
      assertFeatureResponseTextWithinLimit(result.toolClarification.prompt);
    }
    if (result.kind === "resumable_clarification") {
      const clarificationResponse: AssistantResponse = {
        expectsFollowUp: true,
        status: "ok",
        text: result.text,
      };
      return {
        kind: "resumable_clarification",
        outcome: input.requestClarification
          ? input.requestClarification(clarificationResponse, {
              capability: input.command.capability,
              parameter: result.parameter,
            })
          : { response: clarificationResponse },
      };
    }
    const response: AssistantResponse = {
      ...(result.citations ? { citations: result.citations } : {}),
      ...(result.expectsFollowUp ? { expectsFollowUp: true } : {}),
      status: "ok",
      text: result.text,
    };
    let toolObservationReferences:
      | readonly AssistantResultReference[]
      | undefined;
    if (result.resultReferences) {
      input.resultReferences.retain(result.resultReferences);
      toolObservationReferences = input.resultReferences.publicReferences();
    }
    return {
      ...(result.data ? { data: Object.freeze({ ...result.data }) } : {}),
      kind: "completed",
      outcome: { response },
      ...(result.responseRewrite
        ? { responseRewrite: result.responseRewrite }
        : {}),
      ...(result.spokenText ? { spokenText: result.spokenText } : {}),
      ...(result.toolClarification
        ? { toolClarification: result.toolClarification }
        : {}),
      ...(result.toolObservationData
        ? {
            toolObservationData: Object.freeze({
              ...result.toolObservationData,
            }),
          }
        : {}),
      ...(toolObservationReferences ? { toolObservationReferences } : {}),
    };
  } catch (error) {
    return {
      kind: "completed",
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
  spokenText?: FeatureSpokenTextContext;
  text: string;
}): Promise<AssistantOutcome> {
  const prepared = prepareCommandResponse(
    input.response,
    input.facts,
    input.context,
    input.spokenText,
  );
  const rewriter = input.dependencies.responseRewriter;
  if (!rewriter) return { response: prepared.restore() };

  try {
    const rewrite = await rewriter.rewrite(
      {
        capability: input.command.capability,
        command: input.command,
        originalText: input.text,
        ...(prepared.facts.length > 0
          ? { protectedFacts: prepared.facts }
          : {}),
        response: { ...input.response, text: prepared.text },
      },
      input.context,
    );
    return {
      response: {
        ...input.response,
        text: prepared.restore(rewrite.text).text,
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
      prepared.restore(),
    );
  }
}

function prepareCommandResponse(
  response: AssistantResponse,
  facts: AssistantCommand["parameters"],
  context: AssistantContext,
  spokenText?: FeatureSpokenTextContext,
) {
  const assistantTimeZone = context.config.assistant.timeZone;
  const timeZone = spokenText?.timeZone ?? assistantTimeZone;
  const now = context.clock.now();
  const protectedResponse = protectResponseFacts(
    response.text,
    facts,
    now,
    timeZone,
    assistantTimeZone,
    spokenText?.dateStyle ?? "calendar",
  );
  return {
    facts: protectedResponse.facts,
    restore: (text = protectedResponse.text): AssistantResponse => ({
      ...response,
      text: humanizeSpokenText(protectedResponse.restore(text), {
        assistantTimeZone,
        now,
        timeZone,
      }),
    }),
    text: protectedResponse.text,
  };
}
