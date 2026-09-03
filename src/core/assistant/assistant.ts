import type {
  AssistantPolicyConfig,
  AssistantOutcome,
  AssistantResponse,
  ClockPort,
} from "../../ports/assistant.js";
import type { FeaturePlugin } from "../../ports/feature.js";
import type { CapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type { IntentInterpreterPort } from "../../ports/intent.js";
import type { ResponseRewriterPort } from "../../ports/response-rewriter.js";
import type {
  AssistantPersonalization,
  AssistantPersonalizationReaderPort,
} from "../../ports/personal-context.js";
import { humanizeSpokenText } from "../../application/human-text.js";
import {
  assistantTextLimits,
  isAssistantRequestTextWithinLimit,
} from "../../application/assistant-text-policy.js";
import { createAppError } from "./app-error.js";
import { outcomeFromError } from "./assistant-outcome.js";
import {
  createConversationSession,
  type ConversationSessionDependencies,
} from "./conversation-session.js";
import { executeValidatedPlan } from "./command-execution.js";
import { createIntentWorkflow } from "./intent-workflow.js";
import { createInteractionSession } from "./interaction-session.js";
import {
  createResultReferenceSession,
  createWorkflowResultReferenceOverlay,
} from "./result-reference-session.js";

export interface AssistantDependencies {
  capabilityRouting: CapabilityRoutingIndex<FeaturePlugin>;
  clock: ClockPort;
  config: AssistantPolicyConfig;
  conversation?: ConversationSessionDependencies;
  intentInterpreter: IntentInterpreterPort;
  personalizationReader?: AssistantPersonalizationReaderPort;
  responseRewriter?: ResponseRewriterPort;
}

export interface Assistant {
  handleText(
    text: string,
    options?: AssistantRequestOptions,
  ): Promise<AssistantResponse>;
  handleTextWithDiagnostics(
    text: string,
    options?: AssistantRequestOptions,
  ): Promise<AssistantOutcome>;
}

interface AssistantRequestOptions {
  signal?: AbortSignal;
}

export function createAssistant(
  dependencies: AssistantDependencies,
): Assistant {
  const resultReferences = createResultReferenceSession();
  const conversation = dependencies.conversation
    ? createConversationSession({
        ...dependencies.conversation,
        onCompacted: () => resultReferences.invalidateForCompaction(),
      })
    : undefined;
  const interaction = createInteractionSession();

  async function handleTextWithDiagnostics(
    text: string,
    options: AssistantRequestOptions = {},
  ): Promise<AssistantOutcome> {
    if (!isAssistantRequestTextWithinLimit(text)) {
      return outcomeFromError(
        createAppError({
          category: "validation",
          message: `Request text exceeded the ${assistantTextLimits.requestCharacters}-character application limit.`,
        }),
      );
    }

    let personalizationLoad:
      | Promise<{
          diagnostic?: NonNullable<AssistantOutcome["diagnostics"]>[number];
          personalization?: AssistantPersonalization;
        }>
      | undefined;
    const loadPersonalization = () => {
      personalizationLoad ??= readPersonalization(dependencies);
      return personalizationLoad;
    };

    const outcome = await interaction.run(
      text,
      async () => {
        const personalization = await loadPersonalization();
        return createIntentWorkflow({
          dependencies: {
            ...dependencies,
            conversation,
            interaction,
            ...(personalization.personalization
              ? { personalization: personalization.personalization }
              : {}),
            resultReferences,
          },
          text,
          ...(options.signal ? { signal: options.signal } : {}),
        }).run();
      },
      async (plan) => {
        const personalization = await loadPersonalization();
        const workflowReferences =
          createWorkflowResultReferenceOverlay(resultReferences);
        const outcome = await executeValidatedPlan(
          plan,
          dependencies,
          workflowReferences,
          options.signal,
          personalization.personalization
            ? { personalization: personalization.personalization }
            : {},
        );
        workflowReferences.commitDisplayed();
        return outcome;
      },
      async (outcome) => {
        const personalization = await loadPersonalization();
        const completedOutcome = humanizeOutcome(
          appendDiagnostic(outcome, personalization.diagnostic),
          dependencies,
        );
        if (!conversation) {
          resultReferences.completeTurn();
          return completedOutcome;
        }
        try {
          await conversation.commit(text, completedOutcome.response, {
            clock: dependencies.clock,
            config: dependencies.config,
            ...(personalization.personalization
              ? { personalization: personalization.personalization }
              : {}),
            ...(options.signal ? { signal: options.signal } : {}),
          });
        } catch (error) {
          resultReferences.completeTurn();
          return {
            ...completedOutcome,
            diagnostics: [
              ...(completedOutcome.diagnostics ?? []),
              {
                category: "conversation_failure" as const,
                cause: error,
                message:
                  error instanceof Error
                    ? error.message
                    : "Conversation history commit failed.",
              },
            ],
          };
        }
        resultReferences.completeTurn();
        return completedOutcome;
      },
    );

    return outcome;
  }

  return {
    async handleText(
      text: string,
      options: AssistantRequestOptions = {},
    ): Promise<AssistantResponse> {
      const outcome = await handleTextWithDiagnostics(text, options);

      return outcome.response;
    },
    handleTextWithDiagnostics,
  };
}

async function readPersonalization(
  dependencies: Pick<AssistantDependencies, "personalizationReader">,
): Promise<{
  diagnostic?: NonNullable<AssistantOutcome["diagnostics"]>[number];
  personalization?: AssistantPersonalization;
}> {
  if (!dependencies.personalizationReader) return {};
  try {
    const personalization = Object.freeze({
      ...(await dependencies.personalizationReader.readAssistantPersonalization()),
    });
    return Object.keys(personalization).length > 0 ? { personalization } : {};
  } catch (error) {
    return {
      diagnostic: {
        category: "personalization_failure",
        cause: error,
        message:
          error instanceof Error
            ? error.message
            : "Assistant personalization could not be read.",
      },
    };
  }
}

function appendDiagnostic(
  outcome: AssistantOutcome,
  diagnostic: NonNullable<AssistantOutcome["diagnostics"]>[number] | undefined,
): AssistantOutcome {
  if (!diagnostic) return outcome;
  return {
    ...outcome,
    diagnostics: [...(outcome.diagnostics ?? []), diagnostic],
  };
}

function humanizeOutcome(
  outcome: AssistantOutcome,
  dependencies: Pick<AssistantDependencies, "clock" | "config">,
): AssistantOutcome {
  const now = dependencies.clock.now();
  const timeZone = dependencies.config.assistant.timeZone;
  const humanizeResponse = (
    response: AssistantResponse,
  ): AssistantResponse => ({
    ...response,
    text: humanizeSpokenText(response.text, {
      assistantTimeZone: timeZone,
      now,
      timeZone,
    }),
  });

  return {
    ...outcome,
    ...(outcome.plan
      ? {
          plan: {
            steps: outcome.plan.steps.map((step) => ({
              ...step,
              ...(step.response
                ? { response: humanizeResponse(step.response) }
                : {}),
            })),
          },
        }
      : {}),
    response: humanizeResponse(outcome.response),
  };
}
