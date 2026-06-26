import type {
  AssistantConfig,
  AssistantContext,
  AssistantResponse,
  ClockPort,
} from "../../ports/assistant.js";
import type { FeaturePlugin } from "../../ports/feature.js";
import type { IntentInterpreterPort } from "../../ports/intent.js";

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
          candidate.canHandle(command, context),
      );

      if (!feature) {
        return {
          status: "unsupported",
          text: `I do not have an enabled feature for ${command.capability}.`,
        };
      }

      try {
        const result = await feature.execute(command, context);

        return {
          status: "ok",
          text: result.text,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown feature error";

        return {
          status: "error",
          text: `I could not complete that command: ${message}`,
        };
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
