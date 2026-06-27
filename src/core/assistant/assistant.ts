import type {
  AssistantPolicyConfig,
  AssistantContext,
  AssistantResponse,
  ClockPort,
} from "../../ports/assistant.js";
import type { FeaturePlugin } from "../../ports/feature.js";
import type { IntentInterpreterPort } from "../../ports/intent.js";
import {
  createAppError,
  mapAppErrorToResponse,
  type AppError,
} from "./app-error.js";
import { decodeCommandForCapability } from "./command-validation.js";
import { evaluateConfirmationPolicy } from "./confirmation-policy.js";

export interface AssistantDependencies {
  clock: ClockPort;
  config: AssistantPolicyConfig;
  features: FeaturePlugin[];
  intentInterpreter: IntentInterpreterPort;
}

export interface AssistantOutcome {
  response: AssistantResponse;
  diagnostics?: AppError[];
}

export interface Assistant {
  handleText(text: string): Promise<AssistantResponse>;
  handleTextWithDiagnostics(text: string): Promise<AssistantOutcome>;
}

export function createAssistant(
  dependencies: AssistantDependencies,
): Assistant {
  async function handleTextWithDiagnostics(
    text: string,
  ): Promise<AssistantOutcome> {
    return handleTextInternal(text, dependencies);
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
  const interpretation = await dependencies.intentInterpreter.interpret(
    normalizedText,
    context,
  );

  if (interpretation.response) {
    return {
      response: interpretation.response,
    };
  }

  if (!interpretation.command) {
    return {
      response: {
        status: "unknown",
        text: "I could not understand that command.",
      },
    };
  }

  const command = interpretation.command;
  const feature = dependencies.features.find(
    (candidate) =>
      isFeatureEnabled(candidate, dependencies.config) &&
      declaresCapability(candidate, command.capability) &&
      candidate.canHandle?.(command, context) !== false,
  );

  if (!feature) {
    return outcomeFromError(
      createAppError({
        category: "unsupported",
        capability: command.capability,
        message: `No enabled feature can handle ${command.capability}.`,
      }),
    );
  }

  try {
    const capability = feature.capabilities.find(
      (candidate) => candidate.name === command.capability,
    );

    if (!capability) {
      return outcomeFromError(
        createAppError({
          category: "unsupported",
          capability: command.capability,
          message: `${feature.id} does not declare ${command.capability}.`,
        }),
      );
    }

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
      return outcomeFromError(confirmationError);
    }

    const result = await feature.execute(
      {
        capability: command.capability,
        command,
        args: decodedCommand.args,
      },
      context,
    );

    return {
      response: {
        status: "ok",
        text: result.text,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown feature error";

    return outcomeFromError(
      createAppError({
        category: "feature_failure",
        capability: command.capability,
        cause: error,
        message,
      }),
    );
  }
}

function outcomeFromError(error: AppError): AssistantOutcome {
  const outcome: AssistantOutcome = {
    response: mapAppErrorToResponse(error),
  };

  if (error.cause !== undefined || error.category === "feature_failure") {
    outcome.diagnostics = [error];
  }

  return outcome;
}

function isFeatureEnabled(
  feature: FeaturePlugin,
  config: AssistantPolicyConfig,
): boolean {
  return config.features[feature.id]?.enabled === true;
}

function declaresCapability(
  feature: FeaturePlugin,
  capabilityName: string,
): boolean {
  return feature.capabilities.some(
    (capability) => capability.name === capabilityName,
  );
}
