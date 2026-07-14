import type { AssistantCommand, ConfirmationDeclaration } from "./assistant.js";
import type { CapabilityRoute } from "./capability-catalog.js";
import type { FeatureArguments, FeaturePlugin } from "./feature.js";

export interface ValidatedAssistantPlanStep {
  readonly command: AssistantCommand;
  readonly confirmation:
    | { readonly required: false }
    | {
        readonly declaration: ConfirmationDeclaration;
        readonly required: true;
      };
  readonly decodedArgs: FeatureArguments;
  readonly route: CapabilityRoute<FeaturePlugin>;
}

export interface ValidatedAssistantPlan {
  readonly kind: "single" | "compound";
  readonly originalText: string;
  readonly steps: readonly ValidatedAssistantPlanStep[];
}
