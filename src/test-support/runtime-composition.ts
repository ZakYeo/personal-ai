import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDeterministicRuntime } from "../runtimes/deterministic-runtime.js";
import type { LoadedRuntimeConfig } from "../runtimes/config/config.js";
import {
  deterministicNow,
  enabledDeterministicConfig,
} from "./deterministic-runtime-fixtures.js";

type DeterministicRuntimeHarnessOptions = Partial<{
  config: LoadedRuntimeConfig;
  configPath: string;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
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
    ...(options.env ? { env: options.env } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    now: options.now ?? deterministicNow,
  });
}

export async function writeRuntimeHarnessConfig(
  config: LoadedRuntimeConfig,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "personal-ai-runtime-"));
  const configPath = join(directory, "config.json");

  await writeFile(configPath, JSON.stringify(config));

  return configPath;
}

export function createRuntimeConfigWithUnknownIntentProvider(): LoadedRuntimeConfig {
  return {
    ...enabledDeterministicConfig,
    intent: { provider: "unknown" },
  };
}

export function createRuntimeConfigWithOpenAIIntentProvider(): LoadedRuntimeConfig {
  return {
    ...enabledDeterministicConfig,
    intent: {
      provider: "openai",
      openai: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.test/v1",
        model: "gpt-5.5",
        timeoutMs: 30_000,
      },
    },
  };
}

export function createRuntimeConfigWithUnknownFeatureAdapter(): LoadedRuntimeConfig {
  return {
    ...enabledDeterministicConfig,
    features: {
      ...enabledDeterministicConfig.features,
      calendar: { enabled: true, adapter: "unknown" },
    },
  };
}

export function createRuntimeConfigWithMissingFeatureAdapter(): LoadedRuntimeConfig {
  return {
    ...enabledDeterministicConfig,
    features: {
      ...enabledDeterministicConfig.features,
      calendar: { enabled: true },
    },
  };
}
