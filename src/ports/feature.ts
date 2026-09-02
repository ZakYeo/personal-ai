import type {
  AssistantCitation,
  AssistantCommand,
  AssistantContext,
  AssistantCommandParameters,
} from "./assistant.js";
import type {
  CapabilityCatalog,
  FeatureCapability,
  FeatureCapabilityParameter,
} from "./capability-catalog.js";
import type { FeatureResultReferenceSet } from "./result-reference.js";

export type { ConfirmationDeclaration } from "./assistant.js";
export type {
  FeatureCapability,
  FeatureCapabilityParameter,
} from "./capability-catalog.js";

export interface FeatureExecutionContext extends AssistantContext {
  readonly capabilityCatalog: CapabilityCatalog;
  readonly validatedConfirmationFacts?: Readonly<AssistantCommandParameters>;
}

export type FeatureCapabilityParameters = Readonly<
  Record<string, FeatureCapabilityParameter>
>;

interface CompletedFeatureResult {
  text: string;
  citations?: readonly AssistantCitation[];
  data?: AssistantCommandParameters;
  expectsFollowUp?: boolean;
  failure?: FeatureFailure;
  resultReferences?: FeatureResultReferenceSet;
  responseRewrite?: "disabled";
  spokenText?: FeatureSpokenTextContext;
  toolClarification?: FeatureToolClarification;
  toolObservationData?: AssistantCommandParameters;
}

interface FeatureFailure {
  readonly cause?: unknown;
  readonly message: string;
}

export interface FeatureSpokenTextContext {
  readonly dateStyle: "calendar" | "contextual";
  readonly timeZone: string;
}

export interface FeatureClarificationReplyCommand {
  readonly capability: string;
  readonly fixedParameters: AssistantCommandParameters;
  readonly replyParameter: string;
}

export interface FeatureToolClarification {
  readonly prompt: string;
  readonly replyCommand: FeatureClarificationReplyCommand;
}

interface ResumableFeatureClarification {
  readonly citations?: never;
  readonly data?: never;
  readonly expectsFollowUp?: never;
  readonly kind: "resumable_clarification";
  readonly parameter: string;
  readonly resultReferences?: never;
  readonly responseRewrite?: never;
  readonly spokenText?: never;
  readonly text: string;
  readonly toolClarification?: never;
  readonly toolObservationData?: never;
}

export type FeatureResult =
  | (CompletedFeatureResult & { readonly kind?: never })
  | ResumableFeatureClarification;

export type FeatureExecutionResult =
  | (CompletedFeatureResult & { readonly kind: "completed" })
  | ResumableFeatureClarification;

export type FeatureArgumentValue = string | number | boolean | undefined;
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
  readonly id: string;
  readonly displayName: string;
  readonly spokenSummary?: string;
  readonly capabilities: readonly FeatureCapability[];
  readonly canHandle?: (
    command: AssistantCommand,
    context: AssistantContext,
  ) => boolean;
  execute(
    request: TExecutionRequest,
    context: FeatureExecutionContext,
  ): Promise<FeatureExecutionResult>;
}

type FeatureParameterValue<TParameter extends FeatureCapabilityParameter> =
  TParameter extends {
    readonly type: "string";
    readonly allowedValues: readonly (infer TValue extends string)[];
  }
    ? TValue
    : TParameter["type"] extends "string"
      ? string
      : TParameter["type"] extends "number"
        ? number
        : boolean;

type RequiredFeatureParameterKeys<
  TParameters extends FeatureCapabilityParameters,
> = {
  [TKey in keyof TParameters]: TParameters[TKey] extends { required: true }
    ? TKey
    : never;
}[keyof TParameters];

type OptionalFeatureParameterKeys<
  TParameters extends FeatureCapabilityParameters,
> = Exclude<keyof TParameters, RequiredFeatureParameterKeys<TParameters>>;

export type FeatureArgsFromParameters<
  TParameters extends FeatureCapabilityParameters,
> = {
  [TKey in RequiredFeatureParameterKeys<TParameters>]: FeatureParameterValue<
    TParameters[TKey]
  >;
} & {
  [TKey in OptionalFeatureParameterKeys<TParameters>]?: FeatureParameterValue<
    TParameters[TKey]
  >;
};
