import type {
  AssistantContext,
  AssistantOutcome,
  AssistantPolicyConfig,
  ClockPort,
} from "../../ports/assistant.js";
import type { ValidatedAssistantPlan } from "../../ports/assistant-plan.js";
import type { CapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type { FeaturePlugin } from "../../ports/feature.js";
import type {
  IntentClarificationMetadata,
  IntentInterpretation,
  IntentInterpreterPort,
  IntentInterpreterSession,
} from "../../ports/intent.js";
import type { ResponseRewriterPort } from "../../ports/response-rewriter.js";
import type { AssistantPersonalization } from "../../ports/personal-context.js";
import { createAppError } from "./app-error.js";
import { outcomeFromError, unexpectedOutcome } from "./assistant-outcome.js";
import {
  createTrustedCommandContext,
  executeValidatedPlan,
  executeWorkflowRead,
} from "./command-execution.js";
import type { ConversationSession } from "./conversation-session.js";
import type { InteractionSession } from "./interaction-session.js";
import {
  createPlanConfirmationPrompt,
  planRequiresConfirmation,
} from "./plan-confirmation.js";
import { createSemanticallyValidatedIntentSession } from "./intent-semantic-validation.js";
import { validateAssistantPlan } from "./plan-validation.js";
import type { ResultReferenceSession } from "./result-reference-session.js";
import {
  createToolChainState,
  rejectToolChain,
  resolveToolCalls,
  withToolChainOutcome,
} from "./tool-chain.js";

interface IntentWorkflowDependencies {
  capabilityRouting: CapabilityRoutingIndex<FeaturePlugin>;
  clock: ClockPort;
  config: AssistantPolicyConfig;
  conversation: ConversationSession | undefined;
  interaction: InteractionSession;
  intentInterpreter: IntentInterpreterPort;
  personalization?: AssistantPersonalization;
  responseRewriter?: ResponseRewriterPort;
  resultReferences: ResultReferenceSession;
}

export function createIntentWorkflow(input: {
  dependencies: IntentWorkflowDependencies;
  signal?: AbortSignal;
  text: string;
}): { run(): Promise<AssistantOutcome> } {
  const normalizedText = input.text.trim();
  const conversationState = input.dependencies.conversation?.snapshot();
  let activeUserText = normalizedText;
  const context = createContext(input.dependencies, input.signal);
  let session: IntentInterpreterSession | undefined;
  const toolChain = createToolChainState();
  let clarificationUsed = false;

  return { run };

  async function run(): Promise<AssistantOutcome> {
    if (normalizedText.length === 0) {
      return decorate({
        response: {
          status: "unknown",
          text: "I need a command to help with.",
        },
      });
    }

    try {
      session = createSemanticallyValidatedIntentSession({
        capabilityCatalog: input.dependencies.capabilityRouting.catalog,
        originalText: normalizedText,
        session: conversationState
          ? input.dependencies.intentInterpreter.start(
              normalizedText,
              context,
              conversationState,
            )
          : input.dependencies.intentInterpreter.start(normalizedText, context),
      });
      return handleInterpretation(await session.next());
    } catch (error) {
      return decorate(unexpectedOutcome(error));
    }
  }

  async function handleInterpretation(
    current: IntentInterpretation,
  ): Promise<AssistantOutcome> {
    if (current.kind === "tool_call") {
      try {
        const resolved = await resolveToolCalls({
          executeRead: (step) =>
            executeWorkflowRead({
              context,
              dependencies: input.dependencies,
              normalizedText: activeUserText,
              resultReferences: input.dependencies.resultReferences,
              step,
            }),
          initial: current,
          session: requireSession(),
          state: toolChain,
          validateRead,
        });
        return resolved.kind === "outcome"
          ? decorate(resolved.outcome)
          : handleInterpretation(resolved.interpretation);
      } catch (error) {
        return decorate(unexpectedOutcome(error));
      }
    }

    if (current.kind === "clarification") {
      return requestClarification(current.response, current.clarification);
    }
    if (current.kind === "rephrase") {
      return decorate({
        response: { ...current.response, expectsFollowUp: true },
      });
    }
    if (current.kind === "replacement") {
      return decorate(
        unexpectedOutcome(
          new Error(
            "A request replacement was returned outside a clarification reply.",
          ),
        ),
      );
    }
    if (current.kind === "unknown" || current.kind === "unsupported") {
      return decorate({ response: current.response });
    }
    if (current.kind === "conversation") {
      return decorate(await handleConversation());
    }

    const commands =
      current.kind === "plan" ? current.plan.commands : [current.command];
    const validation = validateAssistantPlan({
      capabilityRouting: input.dependencies.capabilityRouting,
      commands,
      config: input.dependencies.config,
      context: trustedContext(),
      kind: current.kind === "plan" ? "compound" : "single",
      originalText: activeUserText,
    });
    if (!validation.ok) {
      return "clarification" in validation
        ? requestClarification(validation.clarification, {
            capability: validation.clarificationCapability,
            origin: "feature_validation",
            session: "resume",
          })
        : decorate(outcomeFromError(validation.error));
    }
    if (planRequiresConfirmation(validation.plan)) {
      return input.dependencies.interaction.requestConfirmation(
        validation.plan,
        decorate(createPlanConfirmationPrompt(validation.plan)),
        executePlan,
      );
    }
    return executePlan(validation.plan);
  }

  async function executePlan(
    plan: ValidatedAssistantPlan,
  ): Promise<AssistantOutcome> {
    return decorate(
      await executeValidatedPlan(
        plan,
        input.dependencies,
        input.dependencies.resultReferences,
        context.signal,
        {
          ...(input.dependencies.personalization
            ? { personalization: input.dependencies.personalization }
            : {}),
          requestClarification: (response, metadata) =>
            requestClarification(response, {
              ...metadata,
              origin: "feature_execution",
              session: "resume",
            }),
        },
      ),
    );
  }

  function validateRead({
    call,
  }: Extract<IntentInterpretation, { kind: "tool_call" }>) {
    const validation = validateAssistantPlan({
      capabilityRouting: input.dependencies.capabilityRouting,
      commands: [call.command],
      config: input.dependencies.config,
      context: trustedContext(),
      kind: "single" as const,
      originalText: activeUserText,
    });
    if (!validation.ok) {
      return {
        ok: false as const,
        outcome:
          "error" in validation
            ? outcomeFromError(validation.error)
            : rejectToolChain(
                call.command.capability,
                "Read capabilities may not request user clarification.",
              ).outcome,
      };
    }
    if (
      validation.plan.steps[0]!.route.capability.toolChain !== "read" ||
      planRequiresConfirmation(validation.plan)
    ) {
      return {
        ok: false as const,
        outcome: rejectToolChain(
          call.command.capability,
          "Only declared, confirmation-free read capabilities may run inside a tool chain.",
        ).outcome,
      };
    }
    return { ok: true as const, step: validation.plan.steps[0]! };
  }

  function requestClarification(
    response: AssistantOutcome["response"],
    metadata:
      | IntentClarificationMetadata
      | {
          capability: string;
          origin: "feature_execution" | "feature_validation";
          parameter?: string;
          session: "resume";
        },
  ): AssistantOutcome {
    if (clarificationUsed) {
      return decorate(clarificationLimitOutcome);
    }
    clarificationUsed = true;
    return input.dependencies.interaction.requestClarification(
      decorate({ response: { ...response, expectsFollowUp: true } }),
      async (reply) => {
        try {
          activeUserText = reply.trim();
          const interpretation = await requireSession().next({
            clarification: {
              ...metadata,
              originalText: normalizedText,
              prompt: response.text,
            },
            kind: "user_reply",
            text: reply,
          });
          return interpretation.kind === "replacement" ||
            changesClarifiedCapability(interpretation, metadata.capability)
            ? { kind: "replacement" }
            : {
                kind: "completed",
                outcome: await handleInterpretation(interpretation),
              };
        } catch (error) {
          return {
            kind: "completed",
            outcome: decorate(unexpectedOutcome(error)),
          };
        }
      },
    );
  }

  function changesClarifiedCapability(
    interpretation: IntentInterpretation,
    clarifiedCapability: string | undefined,
  ): boolean {
    if (!clarifiedCapability) return false;
    if (interpretation.kind === "command") {
      return interpretation.command.capability !== clarifiedCapability;
    }
    if (interpretation.kind === "plan") {
      return interpretation.plan.commands.every(
        (command) => command.capability !== clarifiedCapability,
      );
    }
    return false;
  }

  async function handleConversation(): Promise<AssistantOutcome> {
    const conversation = input.dependencies.conversation;
    if (!conversation || !conversationState) {
      return {
        response: {
          status: "unknown",
          text: "I could not understand that command.",
        },
      };
    }
    try {
      return {
        response: await conversation.respond(
          activeUserText,
          conversationState,
          context,
        ),
      };
    } catch (error) {
      return outcomeFromError(
        createAppError({
          category: "conversation_failure",
          cause: error,
          message:
            error instanceof Error
              ? error.message
              : "Unknown conversation error",
        }),
      );
    }
  }

  function trustedContext(): AssistantContext {
    return createTrustedCommandContext(
      context,
      input.dependencies.resultReferences,
      activeUserText,
    );
  }

  function requireSession(): IntentInterpreterSession {
    if (!session) throw new Error("Intent workflow session was not started.");
    return session;
  }

  function decorate(outcome: AssistantOutcome): AssistantOutcome {
    const withTrace = withToolChainOutcome(outcome, toolChain);
    const diagnostics = [
      ...(withTrace.diagnostics ?? []),
      ...toolChain.calls.flatMap((call) => call.diagnostics ?? []),
    ];
    const uniqueDiagnostics = [...new Set(diagnostics)];
    return uniqueDiagnostics.length === 0
      ? withTrace
      : { ...withTrace, diagnostics: uniqueDiagnostics };
  }
}

const clarificationLimitOutcome: AssistantOutcome = {
  diagnostics: [
    {
      capability: "intent.clarification",
      category: "validation",
      message:
        "An intent workflow may ask at most one resumable clarification.",
    },
  ],
  response: {
    expectsFollowUp: true,
    status: "unknown",
    text: "I still need more information. Please restate the request with the missing details.",
  },
};

function createContext(
  dependencies: IntentWorkflowDependencies,
  signal: AbortSignal | undefined,
): AssistantContext {
  const references = dependencies.resultReferences.publicReferences();
  return {
    clock: dependencies.clock,
    config: dependencies.config,
    ...(dependencies.personalization
      ? { personalization: dependencies.personalization }
      : {}),
    ...(signal ? { signal } : {}),
    ...(references.length > 0 ? { resultReferences: references } : {}),
  };
}
