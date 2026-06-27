import type {
  AssistantCommand,
  AssistantPolicyConfig,
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
import { deterministicTestNow } from "./primitives.js";

export const featureContractNow = deterministicTestNow;

export function createFeatureContext(
  config: AssistantPolicyConfig = createFeatureConfig(),
): AssistantContext {
  return {
    clock: {
      now: () => featureContractNow,
    },
    config,
  };
}

function createFeatureConfig(
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

function createTypedFeatureCommand<TCapability extends string>(
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

export async function executeFeature<
  TCapability extends string,
  TArgs extends FeatureArguments,
>(
  feature: FeaturePlugin,
  capability: TCapability,
  args: TArgs,
  context: AssistantContext = createFeatureContext(),
  rawText = "feature command",
): Promise<FeatureResult> {
  return feature.execute(
    createFeatureExecutionRequest(
      createTypedFeatureCommand(capability, args, rawText),
      args,
    ),
    context,
  );
}

export async function expectDecodedFeatureExecution<
  TCapability extends string,
  TArgs extends FeatureArguments,
>(
  feature: FeaturePlugin,
  capability: TCapability,
  args: TArgs,
  expected: FeatureResult,
  context: AssistantContext = createFeatureContext(),
  rawText = "feature command",
): Promise<void> {
  await expect(
    executeFeature(feature, capability, args, context, rawText),
  ).resolves.toEqual(expected);
}

function createFeatureExecutionRequest<TCapability extends string>(
  command: AssistantCommand & { capability: TCapability },
): FeatureExecutionRequest<TCapability, Record<string, never>>;
function createFeatureExecutionRequest<
  TCapability extends string,
  TArgs extends object,
>(
  command: AssistantCommand & { capability: TCapability },
  args: TArgs,
): FeatureExecutionRequest<TCapability, TArgs>;
function createFeatureExecutionRequest<
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
