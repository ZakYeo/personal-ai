import { createAssistant } from "../core/assistant/assistant.js";
import type {
  AssistantCommand,
  AssistantPolicyConfig,
  AssistantContext,
  ClockPort,
} from "../ports/assistant.js";
import type { LoadedRuntimeConfig } from "../runtimes/config/config.js";
import type {
  FeatureArguments,
  FeatureArgsFromParameters,
  FeatureCapability,
  FeatureCapabilityParameters,
  FeatureExecutionRequest,
  FeaturePlugin,
  FeatureResult,
} from "../ports/feature.js";
import { defineCapability, defineFeature } from "../ports/feature.js";
import type {
  IntentInterpretation,
  IntentInterpreterPort,
} from "../ports/intent.js";

export const fixedNow = new Date("2026-06-26T09:00:00.000Z");

export function createFixedClock(now: Date = fixedNow): ClockPort {
  return {
    now: () => now,
  };
}

export function createAssistantConfig(
  features: AssistantPolicyConfig["features"] = {
    test: { enabled: true },
  },
): AssistantPolicyConfig {
  return {
    assistant: {
      name: "Jarvis",
      wakePhrases: ["hey jarvis"],
    },
    features,
  };
}

export function createLoadedRuntimeConfig(
  features: LoadedRuntimeConfig["features"] = {
    test: { enabled: true, adapter: "mock" },
  },
): LoadedRuntimeConfig {
  return {
    ...createAssistantConfig(features),
    intent: {
      provider: "deterministic",
    },
    features,
  };
}

export function enableFeatures(...featureIds: string[]): AssistantPolicyConfig {
  return createAssistantConfig(
    Object.fromEntries(
      featureIds.map((featureId) => [featureId, { enabled: true }]),
    ),
  );
}

export function requireConfirmationFor(
  featureId: string,
  capabilities: string[],
): AssistantPolicyConfig {
  return createAssistantConfig({
    [featureId]: {
      enabled: true,
      confirmationRequiredCapabilities: capabilities,
    },
  });
}

export function createCommand(
  capability: string = "test.echo",
  parameters: AssistantCommand["parameters"] = {},
  rawText = "hello",
): AssistantCommand {
  return {
    capability,
    parameters,
    rawText,
  };
}

export function createInterpreter(
  interpretation: AssistantCommand | IntentInterpretation,
): IntentInterpreterPort {
  return {
    interpret: () =>
      Promise.resolve(
        "capability" in interpretation
          ? { command: interpretation }
          : interpretation,
      ),
  };
}

export function createFeature<
  const TParameters extends FeatureCapabilityParameters = Record<string, never>,
>(overrides: TestFeatureOverrides<TParameters> = {}): FeaturePlugin {
  const capability = overrides.capability ?? {
    name: "test.echo",
    risk: "low",
    parameters: {} as TParameters,
  };
  const parameters = capability.parameters ?? ({} as TParameters);
  const execute =
    overrides.execute ??
    (() =>
      Promise.resolve({
        text: "Handled.",
      }));

  return defineFeature({
    id: overrides.id ?? "test",
    displayName: overrides.displayName ?? "Test",
    capabilities: {
      [capability.name]: defineCapability({
        risk: capability.risk,
        ...(capability.requiresConfirmation === undefined
          ? {}
          : { requiresConfirmation: capability.requiresConfirmation }),
        parameters,
        execute,
      }),
    },
    ...(overrides.canHandle ? { canHandle: overrides.canHandle } : {}),
  });
}

interface TestFeatureOverrides<
  TParameters extends FeatureCapabilityParameters = FeatureCapabilityParameters,
> {
  id?: string;
  displayName?: string;
  canHandle?: (command: AssistantCommand, context: AssistantContext) => boolean;
  capability?: Omit<FeatureCapability, "parameters"> & {
    parameters?: TParameters;
  };
  execute?: (
    request: FeatureExecutionRequest<
      string,
      FeatureArgsFromParameters<TParameters>
    >,
    context: AssistantContext,
  ) => Promise<FeatureResult>;
}

export function createRawFeature(
  overrides: Partial<{
    id: string;
    displayName: string;
    canHandle: (
      command: AssistantCommand,
      context: AssistantContext,
    ) => boolean;
    execute: (
      request: FeatureExecutionRequest<string, FeatureArguments>,
      context: AssistantContext,
    ) => Promise<FeatureResult>;
    capabilities: FeaturePlugin["capabilities"];
  }> = {},
): FeaturePlugin {
  return {
    id: overrides.id ?? "test",
    displayName: overrides.displayName ?? "Test",
    capabilities: overrides.capabilities ?? [
      { name: "test.echo", risk: "low" },
    ],
    ...(overrides.canHandle ? { canHandle: overrides.canHandle } : {}),
    execute:
      overrides.execute ??
      (() =>
        Promise.resolve({
          text: "Handled.",
        })),
  };
}

export function createAssistantHarness(
  overrides: Partial<{
    clock: ClockPort;
    config: AssistantPolicyConfig;
    features: FeaturePlugin[];
    interpretation: AssistantCommand | IntentInterpretation;
    intentInterpreter: IntentInterpreterPort;
  }> = {},
): ReturnType<typeof createAssistant> {
  return createAssistant({
    clock: overrides.clock ?? createFixedClock(),
    config: overrides.config ?? createAssistantConfig(),
    features: overrides.features ?? [createFeature()],
    intentInterpreter:
      overrides.intentInterpreter ??
      createInterpreter(overrides.interpretation ?? createCommand()),
  });
}
