import { createConfiguredTextRuntime } from "../runtimes/configured-text-runtime.js";
import type { LoadedRuntimeConfig } from "../runtimes/config/config.js";
import {
  deterministicNow,
  enabledDeterministicConfig,
} from "./deterministic-runtime-fixtures.js";
import { writeTempJsonFile } from "./primitives.js";

type ConfiguredTextRuntimeHarnessOptions = Partial<{
  config: LoadedRuntimeConfig;
  configPath: string;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  now: () => Date;
  useRuntimeDefaultConfig: boolean;
}>;

export async function createConfiguredTextRuntimeHarness(
  options: ConfiguredTextRuntimeHarnessOptions = {},
) {
  const config =
    options.config ??
    (options.configPath || options.useRuntimeDefaultConfig
      ? undefined
      : enabledDeterministicConfig);

  return createConfiguredTextRuntime({
    ...(config ? { config } : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
    ...(options.env ? { env: options.env } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    now: options.now ?? (() => deterministicNow),
  });
}

export async function writeRuntimeHarnessConfig(
  config: LoadedRuntimeConfig,
): Promise<string> {
  return writeTempJsonFile(config, "personal-ai-runtime-");
}

export function createRuntimeConfigWithUnknownIntentProvider(): LoadedRuntimeConfig {
  return withIntentProvider("unknown");
}

export function createRuntimeConfigWithOpenAIIntentProvider(): LoadedRuntimeConfig {
  return withIntentProvider("openai", {
    apiKeyEnv: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.test/v1",
    model: "gpt-5.5",
    timeoutMs: 30_000,
  });
}

export function createRuntimeConfigWithGoogleCalendarAdapter(): LoadedRuntimeConfig {
  return {
    ...enabledDeterministicConfig,
    features: {
      ...enabledDeterministicConfig.features,
      calendar: {
        enabled: true,
        adapter: "google",
        rawConfig: {
          enabled: true,
          adapter: "google",
          google: {
            accessTokenEnv: "GOOGLE_CALENDAR_ACCESS_TOKEN",
            baseUrl: "https://calendar.example.test/v3",
            calendarId: "primary",
            maxResults: 10,
            timeoutMs: 30_000,
          },
        },
      },
    },
  };
}

export function createRuntimeConfigWithUnknownFeatureAdapter(): LoadedRuntimeConfig {
  return withFeatureAdapterId("calendar", "unknown");
}

export function createRuntimeConfigWithMissingFeatureAdapter(): LoadedRuntimeConfig {
  return withoutFeatureAdapterId("calendar");
}

export function withIntentProvider(
  provider: string,
  openai?: LoadedRuntimeConfig["intent"]["openai"],
  config: LoadedRuntimeConfig = enabledDeterministicConfig,
): LoadedRuntimeConfig {
  return {
    ...config,
    intent: {
      provider,
      ...(openai ? { openai } : {}),
    },
  };
}

export function withFeatureAdapterId(
  featureId: string,
  adapter: string,
  config: LoadedRuntimeConfig = enabledDeterministicConfig,
): LoadedRuntimeConfig {
  const feature = config.features[featureId];
  const enabled = feature?.enabled ?? true;

  return {
    ...config,
    features: {
      ...config.features,
      [featureId]: {
        ...feature,
        adapter,
        enabled,
        rawConfig: {
          ...(feature?.rawConfig ?? feature ?? {}),
          adapter,
          enabled,
        },
      },
    },
  };
}

export function withFeatureEnabled(
  featureId: string,
  enabled: boolean,
  config: LoadedRuntimeConfig = enabledDeterministicConfig,
): LoadedRuntimeConfig {
  const feature = config.features[featureId];

  return {
    ...config,
    features: {
      ...config.features,
      [featureId]: {
        ...(feature ?? {}),
        enabled,
        rawConfig: {
          ...(feature?.rawConfig ?? feature ?? {}),
          enabled,
        },
      },
    },
  };
}

export function withoutFeatureAdapterId(
  featureId: string,
  config: LoadedRuntimeConfig = enabledDeterministicConfig,
): LoadedRuntimeConfig {
  const featureWithoutAdapter = {
    ...(config.features[featureId] ?? { enabled: true }),
  };
  delete featureWithoutAdapter.adapter;
  const rawConfig = {
    ...(featureWithoutAdapter.rawConfig ?? featureWithoutAdapter),
  };
  delete rawConfig.adapter;
  featureWithoutAdapter.rawConfig = rawConfig;

  return {
    ...config,
    features: {
      ...config.features,
      [featureId]: featureWithoutAdapter,
    },
  };
}

export function withVoiceAdapterId(
  key: keyof NonNullable<LoadedRuntimeConfig["voice"]>,
  adapter: string,
  config: LoadedRuntimeConfig,
): LoadedRuntimeConfig {
  return {
    ...config,
    voice: {
      ...config.voice,
      [key]: adapter,
    },
  };
}

export function withoutVoiceConfigKey(
  key: keyof NonNullable<LoadedRuntimeConfig["voice"]>,
  config: LoadedRuntimeConfig,
): LoadedRuntimeConfig {
  const voice = { ...config.voice };
  delete voice[key];

  return {
    ...config,
    voice,
  };
}
