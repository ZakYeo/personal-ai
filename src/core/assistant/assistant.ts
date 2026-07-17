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
  const interaction = createInteractionSession();

  async function handleTextWithDiagnostics(
    text: string,
  ): Promise<AssistantOutcome> {
    let retainedReferences = false;
    return interaction.run(
      text,
      () =>
        createIntentWorkflow({
          dependencies: {
            ...dependencies,
            conversation,
            interaction,
            resultReferences,
            onReferencesRetained: () => {
              retainedReferences = true;
            },
          },
          text,
        }).run(),
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
