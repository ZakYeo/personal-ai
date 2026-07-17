import { createAssistant } from "../core/assistant/assistant.js";
import type { AssistantDependencies } from "../core/assistant/assistant.js";
import type {
  AssistantCommand,
  AssistantPolicyConfig,
  AssistantContext,
  ClockPort,
} from "../ports/assistant.js";
import type { ConversationCompactorPort } from "../ports/conversation.js";
import {
  parseAssistantConfig,
  type LoadedRuntimeConfig,
} from "../runtimes/config/config.js";
import type {
  FeatureArguments,
  FeatureArgsFromParameters,
  FeatureCapability,
  FeatureCapabilityParameters,
  ConfirmationDeclaration,
  FeatureExecutionContext,
  FeatureExecutionRequest,
  FeaturePlugin,
  FeatureResult,
} from "../ports/feature.js";
import { defineCapability, defineFeature } from "../ports/feature.js";
import { createCapabilityRoutingIndex } from "../ports/capability-catalog.js";
import type {
  IntentInterpretation,
  IntentInterpreterPort,
} from "../ports/intent.js";
import { deterministicTestNow } from "./primitives.js";

export const fixedNow = deterministicTestNow;

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
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    features,
  };
}

export function createLoadedRuntimeConfig(
  features: Record<string, Record<string, unknown>>,
): LoadedRuntimeConfig {
  return parseAssistantConfig({
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    conversation: {
      history: {
        maxTurnsBeforeCompaction: 5,
      },
      provider: "disabled",
    },
    intent: {
      provider: "deterministic",
    },
    responseRewriter: {
      provider: "disabled",
    },
    features,
  });
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
  const interpret = () =>
    Promise.resolve(
      "capability" in interpretation
        ? { command: interpretation, kind: "command" as const }
        : interpretation,
    );
  return {
    start: () => ({ next: interpret }),
  };
}

export function createConversationCompactor(): ConversationCompactorPort {
  return {
    compact: (state) =>
      Promise.resolve({
        summary: [
          state.summary,
          ...state.recentTurns.map((turn) => `${turn.role}: ${turn.content}`),
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n"),
        recentTurns: [],
      }),
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
  const confirmation = overrides.confirmation;

  return defineFeature({
    id: overrides.id ?? "test",
    displayName: overrides.displayName ?? "Test",
    capabilities: {
      [capability.name]: defineCapability({
        risk: capability.risk,
        ...(capability.summary === undefined
          ? {}
          : { summary: capability.summary }),
        ...(capability.requiresConfirmation === undefined
          ? {}
          : { requiresConfirmation: capability.requiresConfirmation }),
        parameters,
        ...(confirmation ? { confirmation } : {}),
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
    context: FeatureExecutionContext,
  ) => Promise<FeatureResult>;
  confirmation?: (
    args: FeatureArgsFromParameters<TParameters>,
    context: AssistantContext,
  ) => ConfirmationDeclaration;
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
      context: FeatureExecutionContext,
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
    conversation: AssistantDependencies["conversation"];
  }> = {},
): ReturnType<typeof createAssistant> {
  const features = overrides.features ?? [createFeature()];

  return createAssistant({
    capabilityRouting: createCapabilityRoutingIndex(features),
    clock: overrides.clock ?? createFixedClock(),
    config: overrides.config ?? createAssistantConfig(),
    ...(overrides.conversation ? { conversation: overrides.conversation } : {}),
    intentInterpreter:
      overrides.intentInterpreter ??
      createInterpreter(overrides.interpretation ?? createCommand()),
  });
}
