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
import { humanizeSpokenText } from "../../ports/human-text.js";
import {
  createConversationSession,
  type ConversationSessionDependencies,
} from "./conversation-session.js";
import { executeValidatedPlan } from "./command-execution.js";
import { createIntentWorkflow } from "./intent-workflow.js";
import { createInteractionSession } from "./interaction-session.js";
import { createResultReferenceSession } from "./result-reference-session.js";

export interface AssistantDependencies {
  capabilityRouting: CapabilityRoutingIndex<FeaturePlugin>;
  clock: ClockPort;
  config: AssistantPolicyConfig;
  conversation?: ConversationSessionDependencies;
  intentInterpreter: IntentInterpreterPort;
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
        onCompacted: () => resultReferences.clear(),
      })
    : undefined;
  const interaction = createInteractionSession();

  async function handleTextWithDiagnostics(
    text: string,
    options: AssistantRequestOptions = {},
  ): Promise<AssistantOutcome> {
    const outcome = await interaction.run(
      text,
      () =>
        createIntentWorkflow({
          dependencies: {
            ...dependencies,
            conversation,
            interaction,
            resultReferences,
          },
          text,
          ...(options.signal ? { signal: options.signal } : {}),
        }).run(),
      (plan) =>
        executeValidatedPlan(
          plan,
          dependencies,
          resultReferences,
          options.signal,
        ),
      () => resultReferences.completeTurn(),
    );

    return humanizeOutcome(outcome, dependencies);
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
