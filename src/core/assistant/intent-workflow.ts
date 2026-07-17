import type {
  AssistantContext,
  AssistantOutcome,
  AssistantPolicyConfig,
  ClockPort,
} from "../../ports/assistant.js";
import type { CapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type { FeaturePlugin } from "../../ports/feature.js";
import type {
  IntentInterpretation,
  IntentInterpreterPort,
  IntentInterpreterSession,
} from "../../ports/intent.js";
import type { ResponseRewriterPort } from "../../ports/response-rewriter.js";
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
  responseRewriter?: ResponseRewriterPort;
  resultReferences: ResultReferenceSession;
}

export function createIntentWorkflow(input: {
  dependencies: IntentWorkflowDependencies;
  text: string;
}): { run(): Promise<AssistantOutcome> } {
  const normalizedText = input.text.trim();
  const context = createContext(input.dependencies);
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
      session = input.dependencies.intentInterpreter.start(
        normalizedText,
        context,
      );
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
              normalizedText,
              resultReferences: input.dependencies.resultReferences,
              step,
            }),
          initial: current,
          publicReferences: () =>
            input.dependencies.resultReferences.publicReferences(),
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
      return requestClarification(current.response);
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
      originalText: normalizedText,
    });
    if (!validation.ok) {
      return "clarification" in validation
        ? requestClarification(validation.clarification)
        : decorate(outcomeFromError(validation.error));
    }
    if (planRequiresConfirmation(validation.plan)) {
      return input.dependencies.interaction.requestConfirmation(
        validation.plan,
        decorate(createPlanConfirmationPrompt(validation.plan)),
        decorate,
      );
    }
    return decorate(
      await executeValidatedPlan(
        validation.plan,
        input.dependencies,
        input.dependencies.resultReferences,
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
      originalText: normalizedText,
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
  ): AssistantOutcome {
    if (clarificationUsed) {
      return decorate(
        rejectToolChain(
          "intent.clarification",
          "A tool chain may ask at most one resumable clarification.",
        ).outcome,
      );
    }
    clarificationUsed = true;
    return input.dependencies.interaction.requestClarification(
      decorate({ response: { ...response, expectsFollowUp: true } }),
      async (reply) => {
        try {
          return handleInterpretation(
            await requireSession().next({ kind: "user_reply", text: reply }),
          );
        } catch (error) {
          return decorate(unexpectedOutcome(error));
        }
      },
    );
  }

  async function handleConversation(): Promise<AssistantOutcome> {
    if (!input.dependencies.conversation) {
      return {
        response: {
          status: "unknown",
          text: "I could not understand that command.",
        },
      };
    }
    try {
      return {
        response: await input.dependencies.conversation.respond(
          normalizedText,
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
      normalizedText,
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

function createContext(
  dependencies: IntentWorkflowDependencies,
): AssistantContext {
  const references = dependencies.resultReferences.publicReferences();
  return {
    clock: dependencies.clock,
    config: dependencies.config,
    ...(references.length > 0 ? { resultReferences: references } : {}),
  };
}
