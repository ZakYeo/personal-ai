import type { AssistantCommand, ConfirmationDeclaration } from "./assistant.js";
import type { CapabilityRoute } from "./capability-catalog.js";
import type { FeatureArguments, FeaturePlugin } from "./feature.js";

export interface ValidatedAssistantPlanStep {
  readonly command: AssistantCommand;
  readonly confirmation?: ConfirmationDeclaration;
  readonly decodedArgs: FeatureArguments;
  readonly route: CapabilityRoute<FeaturePlugin>;
}

export interface ValidatedAssistantPlan {
  readonly steps: readonly ValidatedAssistantPlanStep[];
}
