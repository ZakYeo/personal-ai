import { createAssistant } from "../core/assistant/assistant.js";
import type {
  AssistantCommand,
  AssistantConfig,
  AssistantContext,
  ClockPort,
} from "../ports/assistant.js";
import type {
  FeatureArguments,
  FeaturePlugin,
  FeatureResult,
} from "../ports/feature.js";
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
  features: AssistantConfig["features"] = {
    test: { enabled: true },
  },
): AssistantConfig {
  return {
    assistant: {
      name: "Jarvis",
      wakePhrases: ["hey jarvis"],
    },
    intent: {
      provider: "deterministic",
    },
    features,
  };
}

export function enableFeatures(...featureIds: string[]): AssistantConfig {
  return createAssistantConfig(
    Object.fromEntries(
      featureIds.map((featureId) => [featureId, { enabled: true }]),
    ),
  );
}

export function requireConfirmationFor(
  featureId: string,
  capabilities: string[],
): AssistantConfig {
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

export function createFeature(
  overrides: Partial<{
    id: string;
    displayName: string;
    canHandle: (
      command: AssistantCommand,
      context: AssistantContext,
    ) => boolean;
    execute: (
      command: AssistantCommand,
      args: FeatureArguments,
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
    config: AssistantConfig;
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
