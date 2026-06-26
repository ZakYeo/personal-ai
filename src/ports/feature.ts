import type {
  AssistantCommand,
  AssistantContext,
  AssistantCommandParameters,
} from "./assistant.js";

export interface FeatureCapability {
  name: string;
  risk: "low" | "high";
}

export interface FeatureResult {
  text: string;
  data?: AssistantCommandParameters;
}

export interface FeaturePlugin {
  id: string;
  displayName: string;
  capabilities: FeatureCapability[];
  canHandle(command: AssistantCommand, context: AssistantContext): boolean;
  execute(
    command: AssistantCommand,
    context: AssistantContext,
  ): Promise<FeatureResult>;
}
