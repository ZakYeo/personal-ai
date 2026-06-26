import type {
  AssistantCommand,
  AssistantConfig,
  AssistantContext,
  AssistantCommandParameters,
} from "../ports/assistant.js";
import type {
  FeatureArguments,
  FeatureCapability,
  FeatureExecutionRequest,
  FeaturePlugin,
  FeatureResult,
} from "../ports/feature.js";

export const featureContractNow = new Date("2026-06-26T09:00:00.000Z");

export function createFeatureContext(
  config: AssistantConfig = createFeatureConfig(),
): AssistantContext {
  return {
    clock: {
      now: () => featureContractNow,
    },
    config,
  };
}

function createFeatureConfig(
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

export function createFeatureCommand(
  capability: string,
  parameters: AssistantCommandParameters = {},
  rawText = "feature command",
): AssistantCommand {
  return {
    capability,
    parameters,
    rawText,
  };
}

export function createTypedFeatureCommand<TCapability extends string>(
  capability: TCapability,
  parameters: AssistantCommandParameters = {},
  rawText = "feature command",
): AssistantCommand & { capability: TCapability } {
  return {
    capability,
    parameters,
    rawText,
  };
}

export function expectCapabilityMetadata(
  feature: FeaturePlugin,
  expected: FeatureCapability,
): void {
  expect(feature.capabilities).toContainEqual(expected);
}

export function expectFeatureHandles(
  feature: FeaturePlugin,
  supportedCapability: string,
  unsupportedCapability: string,
): void {
  expect(
    feature.capabilities.some(
      (capability) => capability.name === supportedCapability,
    ),
  ).toBe(true);
  expect(
    feature.capabilities.some(
      (capability) => capability.name === unsupportedCapability,
    ),
  ).toBe(false);
}

export async function expectFeatureExecution(
  feature: FeaturePlugin,
  command: AssistantCommand,
  args: FeatureArguments,
  expected: FeatureResult,
  context: AssistantContext = createFeatureContext(),
): Promise<void> {
  await expect(
    feature.execute(createFeatureExecutionRequest(command, args), context),
  ).resolves.toEqual(expected);
}

export async function expectFeatureRejects(
  feature: FeaturePlugin,
  command: AssistantCommand,
  args: FeatureArguments,
  expectedMessage: string,
  context: AssistantContext = createFeatureContext(),
): Promise<void> {
  await expect(
    feature.execute(createFeatureExecutionRequest(command, args), context),
  ).rejects.toThrow(expectedMessage);
}

export function createFeatureExecutionRequest<TCapability extends string>(
  command: AssistantCommand & { capability: TCapability },
): FeatureExecutionRequest<TCapability, Record<string, never>>;
export function createFeatureExecutionRequest<
  TCapability extends string,
  TArgs extends object,
>(
  command: AssistantCommand & { capability: TCapability },
  args: TArgs,
): FeatureExecutionRequest<TCapability, TArgs>;
export function createFeatureExecutionRequest<
  TCapability extends string,
  TArgs extends object,
>(
  command: AssistantCommand & { capability: TCapability },
  args: TArgs | Record<string, never> = {},
): FeatureExecutionRequest<TCapability, TArgs | Record<string, never>> {
  return {
    capability: command.capability,
    command,
    args,
  };
}
