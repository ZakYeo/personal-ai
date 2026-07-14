import type {
  AssistantCommand,
  AssistantContext,
  AssistantCommandParameters,
} from "./assistant.js";
import type {
  CapabilityCatalog,
  FeatureCapability,
  FeatureCapabilityParameter,
} from "./capability-catalog.js";

export type {
  FeatureCapability,
  FeatureCapabilityParameter,
} from "./capability-catalog.js";

export interface FeatureExecutionContext extends AssistantContext {
  capabilityCatalog: CapabilityCatalog;
}

export type FeatureCapabilityParameters = Record<
  string,
  FeatureCapabilityParameter
>;

export interface FeatureResult {
  text: string;
  data?: AssistantCommandParameters;
}

export interface ConfirmationDeclaration {
  facts: AssistantCommandParameters;
  text: string;
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
    context: FeatureExecutionContext,
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
  confirmation?(
    this: void,
    args: FeatureArgsFromParameters<TParameters>,
    context: AssistantContext,
  ): ConfirmationDeclaration;
  parameters: TParameters;
  execute(
    this: void,
    request: FeatureExecutionRequest<
      string,
      FeatureArgsFromParameters<TParameters>
    >,
    context: FeatureExecutionContext,
  ): MaybePromise<FeatureResult>;
};

export function defineCapability<
  const TParameters extends FeatureCapabilityParameters,
>(definition: DefinedCapability<TParameters>): DefinedCapability<TParameters> {
  return definition;
}

type AnyDefinedCapability = Omit<FeatureCapability, "name" | "parameters"> & {
  confirmation?: unknown;
  parameters: FeatureCapabilityParameters;
  execute: unknown;
};
type DefinedCapabilityHandlers = Record<string, AnyDefinedCapability>;
type CapabilityHandlerForRequest<TRequest extends FeatureExecutionRequest> =
  TRequest extends FeatureExecutionRequest<infer TCapability, infer TArgs>
    ? Omit<FeatureCapability, "name" | "parameters"> & {
        parameters: FeatureCapabilityParameters;
        execute(
          this: void,
          request: FeatureExecutionRequest<TCapability, TArgs>,
          context: FeatureExecutionContext,
        ): MaybePromise<FeatureResult>;
      }
    : never;

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
      ...(handler.summary === undefined ? {} : { summary: handler.summary }),
      ...(handler.spokenSummary === undefined
        ? {}
        : { spokenSummary: handler.spokenSummary }),
      ...(handler.description === undefined
        ? {}
        : { description: handler.description }),
      ...(handler.requiresConfirmation === undefined
        ? {}
        : { requiresConfirmation: handler.requiresConfirmation }),
      ...(typeof handler.confirmation === "function"
        ? {
            renderConfirmation: handler.confirmation as NonNullable<
              FeatureCapability["renderConfirmation"]
            >,
          }
        : {}),
      parameters: handler.parameters,
    })),
    ...(definition.canHandle
      ? {
          canHandle: (command: AssistantCommand, context: AssistantContext) =>
            definition.canHandle?.(command, context) ?? true,
        }
      : {}),
    async execute(request, context) {
      return executeSelectedCapability(
        definition.id,
        handlers.get(request.capability),
        request,
        context,
      );
    },
  };
}

function executeSelectedCapability<TRequest extends FeatureExecutionRequest>(
  featureId: string,
  handler: AnyDefinedCapability | undefined,
  request: TRequest,
  context: FeatureExecutionContext,
): MaybePromise<FeatureResult> {
  if (!handler) {
    throw new Error(`${featureId} cannot execute ${request.capability}.`);
  }

  // The runtime key lookup above selects the handler by the same capability
  // name carried by the request. TypeScript cannot retain that map-key
  // correlation, so this cast is isolated at the dispatch boundary.
  const selectedHandler = handler as CapabilityHandlerForRequest<TRequest>;

  return selectedHandler.execute(request, context);
}
