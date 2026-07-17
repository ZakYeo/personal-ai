import type {
  AssistantCommand,
  AssistantContext,
  AssistantPolicyConfig,
  AssistantResponse,
  ConfirmationDeclaration,
} from "../../ports/assistant.js";
import type { ValidatedAssistantPlan } from "../../ports/assistant-plan.js";
import type { CapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type { FeatureArguments, FeaturePlugin } from "../../ports/feature.js";
import { createAppError, type AppError } from "./app-error.js";
import { decodeCommandForCapability } from "./command-validation.js";
import { evaluateConfirmationPolicy } from "./confirmation-policy.js";

type PlanValidationResult =
  | { ok: true; plan: ValidatedAssistantPlan }
  | { clarification: AssistantResponse; ok: false }
  | { error: AppError; ok: false };

export function validateAssistantPlan(input: {
  capabilityRouting: CapabilityRoutingIndex<FeaturePlugin>;
  commands: readonly AssistantCommand[];
  config: AssistantPolicyConfig;
  context: AssistantContext;
  kind: ValidatedAssistantPlan["kind"];
  originalText: string;
}): PlanValidationResult {
  if (input.commands.length < 1 || input.commands.length > 3) {
    return invalidPlan("A compound plan must contain one to three commands.");
  }

  const validatedAt = input.context.clock.now().toISOString();
  const validationInput = {
    ...input,
    context: {
      ...input.context,
      clock: { now: () => new Date(validatedAt) },
    },
  };
  const steps: ValidatedAssistantPlan["steps"][number][] = [];

  for (const proposedCommand of input.commands) {
    const result = validateStep(proposedCommand, validationInput);
    if (!result.ok) {
      return result;
    }
    steps.push(result.step);
  }

  return {
    ok: true,
    plan: Object.freeze({
      kind: input.kind,
      originalText: input.originalText,
      steps: Object.freeze(steps),
      validatedAt,
    }),
  };
}

function validateStep(
  proposedCommand: AssistantCommand,
  input: Parameters<typeof validateAssistantPlan>[0],
):
  | { ok: true; step: ValidatedAssistantPlan["steps"][number] }
  | { clarification: AssistantResponse; ok: false }
  | { error: AppError; ok: false } {
  const route = input.capabilityRouting.get(proposedCommand.capability);
  const feature = route?.feature;

  if (
    !route ||
    !feature ||
    input.config.features[feature.id]?.enabled !== true
  ) {
    return {
      error: createAppError({
        category: "unsupported",
        capability: proposedCommand.capability,
        message: `No enabled feature can handle ${proposedCommand.capability}.`,
      }),
      ok: false,
    };
  }

  try {
    if (feature.canHandle?.(proposedCommand, input.context) === false) {
      return {
        error: createAppError({
          category: "unsupported",
          capability: proposedCommand.capability,
          message: `No enabled feature can handle ${proposedCommand.capability}.`,
        }),
        ok: false,
      };
    }

    const decoded = decodeCommandForCapability(
      proposedCommand,
      route.capability,
    );
    if (!decoded.ok) {
      return decoded;
    }

    const clarification = route.capability.requestClarification?.(
      decoded.args,
      input.context,
    );
    if (clarification) {
      return { clarification, ok: false };
    }

    const confirmationRequired =
      evaluateConfirmationPolicy(feature, route.capability, input.config) !==
      undefined;
    const confirmation = confirmationRequired
      ? renderRequiredConfirmation(
          route.capability.renderConfirmation,
          decoded.args,
          input.context,
          proposedCommand.capability,
        )
      : { required: false as const };

    if (confirmation instanceof Error) {
      return {
        error: createAppError({
          capability: proposedCommand.capability,
          category: "feature_failure",
          cause: confirmation,
          message: confirmation.message,
        }),
        ok: false,
      };
    }

    return {
      ok: true,
      step: Object.freeze({
        command: Object.freeze({
          ...proposedCommand,
          parameters: Object.freeze({ ...proposedCommand.parameters }),
        }),
        confirmation: Object.freeze(confirmation),
        decodedArgs: Object.freeze({ ...decoded.args }),
        route,
      }),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown plan validation error";
    return {
      error: createAppError({
        capability: proposedCommand.capability,
        category: "feature_failure",
        cause: error,
        message,
      }),
      ok: false,
    };
  }
}

function renderRequiredConfirmation(
  renderer:
    | ((
        args: FeatureArguments,
        context: AssistantContext,
      ) => ConfirmationDeclaration)
    | undefined,
  args: FeatureArguments,
  context: AssistantContext,
  capability: string,
): ValidatedAssistantPlan["steps"][number]["confirmation"] | Error {
  if (!renderer) {
    return new Error(
      `${capability} requires a deterministic confirmation renderer.`,
    );
  }

  const declaration = renderer(args, context);
  return {
    declaration: Object.freeze({
      facts: Object.freeze({ ...declaration.facts }),
      text: declaration.text,
    }),
    required: true,
  };
}

function invalidPlan(message: string): PlanValidationResult {
  return {
    error: createAppError({ category: "validation", message }),
    ok: false,
  };
}
