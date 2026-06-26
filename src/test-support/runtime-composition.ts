import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDeterministicRuntime } from "../runtimes/deterministic-runtime.js";
import type { AssistantConfig } from "../ports/assistant.js";
import {
  deterministicNow,
  enabledDeterministicConfig,
} from "./deterministic-scenarios.js";

type DeterministicRuntimeHarnessOptions = Partial<{
  config: AssistantConfig;
  configPath: string;
  now: Date;
  useRuntimeDefaultConfig: boolean;
}>;

export async function createDeterministicRuntimeHarness(
  options: DeterministicRuntimeHarnessOptions = {},
) {
  const config =
    options.config ??
    (options.configPath || options.useRuntimeDefaultConfig
      ? undefined
      : enabledDeterministicConfig);

  return createDeterministicRuntime({
    ...(config ? { config } : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
    now: options.now ?? deterministicNow,
  });
}

export async function writeRuntimeHarnessConfig(
  config: AssistantConfig,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "personal-ai-runtime-"));
  const configPath = join(directory, "config.json");

  await writeFile(configPath, JSON.stringify(config));

  return configPath;
}

export function createRuntimeConfigWithUnknownIntentProvider(): AssistantConfig {
  return {
    ...enabledDeterministicConfig,
    intent: { provider: "unknown" },
  };
}

export function createRuntimeConfigWithUnknownFeatureAdapter(): AssistantConfig {
  return {
    ...enabledDeterministicConfig,
    features: {
      ...enabledDeterministicConfig.features,
      calendar: { enabled: true, adapter: "unknown" },
    },
  };
}

export function createRuntimeConfigWithMissingFeatureAdapter(): AssistantConfig {
  return {
    ...enabledDeterministicConfig,
    features: {
      ...enabledDeterministicConfig.features,
      calendar: { enabled: true },
    },
  };
}
