import type {
  AssistantCommand,
  AssistantConfig,
  AssistantContext,
} from "../ports/assistant.js";
import type {
  FeatureCapability,
  FeaturePlugin,
  FeatureResult,
} from "../ports/feature.js";
import {
  createAssistantConfig,
  createCommand,
  createFixedClock,
} from "./core-assistant.js";

export function createFeatureContext(
  config: AssistantConfig = createAssistantConfig(),
): AssistantContext {
  return {
    clock: createFixedClock(),
    config,
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
  context: AssistantContext = createFeatureContext(),
): void {
  expect(feature.canHandle(createCommand(supportedCapability), context)).toBe(
    true,
  );
  expect(feature.canHandle(createCommand(unsupportedCapability), context)).toBe(
    false,
  );
}

export async function expectFeatureExecution(
  feature: FeaturePlugin,
  command: AssistantCommand,
  expected: FeatureResult,
  context: AssistantContext = createFeatureContext(),
): Promise<void> {
  await expect(feature.execute(command, context)).resolves.toEqual(expected);
}

export async function expectFeatureRejects(
  feature: FeaturePlugin,
  command: AssistantCommand,
  expectedMessage: string,
  context: AssistantContext = createFeatureContext(),
): Promise<void> {
  await expect(feature.execute(command, context)).rejects.toThrow(
    expectedMessage,
  );
}
