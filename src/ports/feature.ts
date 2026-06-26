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

export type FeatureCapabilityParameters = Record<
  string,
  FeatureCapabilityParameter
>;

export interface FeatureResult {
  text: string;
  data?: AssistantCommandParameters;
}

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
  id: string;
  displayName: string;
  capabilities: FeatureCapability[];
  canHandle?(command: AssistantCommand, context: AssistantContext): boolean;
  execute(
    request: TExecutionRequest,
    context: AssistantContext,
  ): Promise<FeatureResult>;
}

type FeatureParameterValue<TParameter extends FeatureCapabilityParameter> =
  TParameter["type"] extends "string"
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

type MaybePromise<TValue> = TValue | Promise<TValue>;

type DefinedCapability<
  TParameters extends FeatureCapabilityParameters = FeatureCapabilityParameters,
> = Omit<FeatureCapability, "name" | "parameters"> & {
  parameters: TParameters;
  execute(
    this: void,
    request: FeatureExecutionRequest<
      string,
      FeatureArgsFromParameters<TParameters>
    >,
    context: AssistantContext,
  ): MaybePromise<FeatureResult>;
};

export function defineCapability<
  const TParameters extends FeatureCapabilityParameters,
>(definition: DefinedCapability<TParameters>): DefinedCapability<TParameters> {
  return definition;
}

type AnyDefinedCapability = Omit<FeatureCapability, "name" | "parameters"> & {
  parameters: FeatureCapabilityParameters;
  execute: unknown;
};
type DefinedCapabilityHandlers = Record<string, AnyDefinedCapability>;

type ParametersForCapability<TCapability> =
  TCapability extends DefinedCapability<infer TParameters>
    ? TParameters
    : never;

type DefinedFeatureExecutionRequest<
  TCapabilities extends DefinedCapabilityHandlers,
> = {
  [TCapability in keyof TCapabilities & string]: FeatureExecutionRequest<
    TCapability,
    FeatureArgsFromParameters<
      ParametersForCapability<TCapabilities[TCapability]>
    >
  >;
}[keyof TCapabilities & string];

interface DefinedFeature<TCapabilities extends DefinedCapabilityHandlers> {
  id: string;
  displayName: string;
  capabilities: TCapabilities;
  canHandle?(command: AssistantCommand, context: AssistantContext): boolean;
}

export function defineFeature<
  const TCapabilities extends DefinedCapabilityHandlers,
>(
  definition: DefinedFeature<TCapabilities>,
): FeaturePlugin<DefinedFeatureExecutionRequest<TCapabilities>> {
  const capabilityEntries = Object.entries(definition.capabilities);
  const handlers = new Map(
    capabilityEntries.map(([capabilityName, handler]) => [
      capabilityName,
      handler,
    ]),
  );

  return {
    id: definition.id,
    displayName: definition.displayName,
    capabilities: capabilityEntries.map(([name, handler]) => ({
      name,
      risk: handler.risk,
      ...(handler.requiresConfirmation === undefined
        ? {}
        : { requiresConfirmation: handler.requiresConfirmation }),
      parameters: handler.parameters,
    })),
    ...(definition.canHandle
      ? {
          canHandle: (command: AssistantCommand, context: AssistantContext) =>
            definition.canHandle?.(command, context) ?? true,
        }
      : {}),
    async execute(request, context) {
      const handler = handlers.get(request.capability);

      if (!handler) {
        throw new Error(
          `${definition.id} cannot execute ${request.capability}.`,
        );
      }

      const execute = handler.execute as (
        this: void,
        request: FeatureExecutionRequest<string, FeatureArguments>,
        context: AssistantContext,
      ) => MaybePromise<FeatureResult>;

      return execute(request, context);
    },
  };
}
