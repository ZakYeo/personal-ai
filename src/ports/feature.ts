import type {
  AssistantCommand,
  AssistantContext,
  AssistantCommandParameters,
} from "./assistant.js";

export interface FeatureCapability {
  name: string;
  risk: "low" | "high";
  requiresConfirmation?: boolean;
  parameters?: Record<string, FeatureCapabilityParameter>;
}

export interface FeatureCapabilityParameter {
  type: "string" | "number" | "boolean";
  required?: boolean;
  minimum?: number;
  positive?: boolean;
}

export interface FeatureResult {
  text: string;
  data?: AssistantCommandParameters;
}

export interface FeaturePlugin {
  id: string;
  displayName: string;
  capabilities: FeatureCapability[];
  canHandle?(command: AssistantCommand, context: AssistantContext): boolean;
  execute(
    command: AssistantCommand,
    context: AssistantContext,
  ): Promise<FeatureResult>;
}
