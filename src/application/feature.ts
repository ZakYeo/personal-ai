import type {
  AssistantCommand,
  AssistantContext,
  AssistantResponse,
  ConfirmationDeclaration,
} from "../ports/assistant.js";
import type { FeatureCapability } from "../ports/capability-catalog.js";
import type {
  FeatureArgsFromParameters,
  FeatureCapabilityParameters,
  FeatureExecutionContext,
  FeatureExecutionRequest,
  FeatureExecutionResult,
  FeaturePlugin,
  FeatureResult,
} from "../ports/feature.js";

export type {
  FeatureArgsFromParameters,
  FeatureCapabilityParameters,
  FeatureExecutionContext,
  FeatureResult,
} from "../ports/feature.js";

type MaybePromise<TValue> = TValue | Promise<TValue>;

type DefinedCapability<
  TParameters extends FeatureCapabilityParameters = FeatureCapabilityParameters,
> = Omit<FeatureCapability, "name" | "parameters"> & {
  confirmation?(
    this: void,
    args: FeatureArgsFromParameters<TParameters>,
    context: AssistantContext,
  ): ConfirmationDeclaration;
  clarification?(
    this: void,
    args: FeatureArgsFromParameters<TParameters>,
    context: AssistantContext,
  ): AssistantResponse | undefined;
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
  clarification?: unknown;
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
  spokenSummary?: string;
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
    ...(definition.spokenSummary
      ? { spokenSummary: definition.spokenSummary }
      : {}),
    capabilities: capabilityEntries.map(([name, handler]) => ({
      name,
      risk: handler.risk,
      ...(handler.toolChain === undefined
        ? {}
        : { toolChain: handler.toolChain }),
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
      ...(typeof handler.clarification === "function"
        ? {
            requestClarification: handler.clarification as NonNullable<
              FeatureCapability["requestClarification"]
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
      return normalizeFeatureResult(
        await executeSelectedCapability(
          definition.id,
          handlers.get(request.capability),
          request,
          context,
        ),
      );
    },
  };
}

export function normalizeFeatureResult(
  result: FeatureResult,
): FeatureExecutionResult {
  return result.kind === "resumable_clarification"
    ? result
    : { ...result, kind: "completed" };
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
