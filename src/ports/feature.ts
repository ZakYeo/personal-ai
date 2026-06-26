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

export type FeatureArgumentValue = string | number | boolean;
export type FeatureArguments = Record<string, FeatureArgumentValue>;

export interface FeatureExecutionRequest<
  TCapability extends string = string,
  TArgs extends object = FeatureArguments,
> {
  capability: TCapability;
  command: AssistantCommand & { capability: TCapability };
  args: TArgs;
}

export interface FeaturePlugin<
  TExecutionRequest extends FeatureExecutionRequest = FeatureExecutionRequest,
> {
  id: string;
  displayName: string;
  capabilities: FeatureCapability[];
  canHandle?(command: AssistantCommand, context: AssistantContext): boolean;
  execute(
    request: TExecutionRequest,
    context: AssistantContext,
  ): Promise<FeatureResult>;
}
