import type {
  AssistantConfig,
  AssistantContext,
  AssistantResponse,
  ClockPort,
} from "../../ports/assistant.js";
import type { FeaturePlugin } from "../../ports/feature.js";
import type { IntentInterpreterPort } from "../../ports/intent.js";
import { createAppError, mapAppErrorToResponse } from "./app-error.js";
import { decodeCommandForCapability } from "./command-validation.js";
import { evaluateConfirmationPolicy } from "./confirmation-policy.js";

export interface AssistantDependencies {
  clock: ClockPort;
  config: AssistantConfig;
  features: FeaturePlugin[];
  intentInterpreter: IntentInterpreterPort;
}

export interface Assistant {
  handleText(text: string): Promise<AssistantResponse>;
}

export function createAssistant(
  dependencies: AssistantDependencies,
): Assistant {
  return {
    async handleText(text: string): Promise<AssistantResponse> {
      const normalizedText = text.trim();

      if (normalizedText.length === 0) {
        return {
          status: "unknown",
          text: "I need a command to help with.",
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
        return interpretation.response;
      }

      if (!interpretation.command) {
        return {
          status: "unknown",
          text: "I could not understand that command.",
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
        return mapAppErrorToResponse(
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
          return mapAppErrorToResponse(
            createAppError({
              category: "unsupported",
              capability: command.capability,
              message: `${feature.id} does not declare ${command.capability}.`,
            }),
          );
        }

        const decodedCommand = decodeCommandForCapability(command, capability);

        if (!decodedCommand.ok) {
          return mapAppErrorToResponse(decodedCommand.error);
        }

        const confirmationError = evaluateConfirmationPolicy(
          feature,
          capability,
          dependencies.config,
        );

        if (confirmationError) {
          return mapAppErrorToResponse(confirmationError);
        }

        const result = await feature.execute(
          command,
          decodedCommand.args,
          context,
        );

        return {
          status: "ok",
          text: result.text,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown feature error";

        return mapAppErrorToResponse(
          createAppError({
            category: "feature_failure",
            capability: command.capability,
            cause: error,
            message,
          }),
        );
      }
    },
  };
}

function isFeatureEnabled(
  feature: FeaturePlugin,
  config: AssistantConfig,
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
