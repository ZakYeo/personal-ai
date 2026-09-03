import { createConfiguredTextRuntime } from "../runtimes/configured-text-runtime.js";
import {
  parseAssistantConfig,
  type LoadedRuntimeConfig,
} from "../runtimes/config/config.js";
import {
  deterministicNow,
  enabledDeterministicConfig,
} from "./deterministic-runtime-fixtures.js";
import { writeTempJsonFile } from "./primitives.js";
import type { OpenAIResponsesConfig } from "../adapters/openai/openai-responses-config.js";
import { createDefaultIntentProviderRegistry } from "../runtimes/intent-provider-selection.js";
import { createDefaultConversationProviderRegistry } from "../runtimes/conversation-provider-selection.js";
import { createDefaultResponseRewriterProviderRegistry } from "../runtimes/response-rewriter-selection.js";
import { resolveConfiguredRuntimeProvider } from "../runtimes/runtime-provider-registry.js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createDefaultFeatureAdapterRegistry } from "../runtimes/default-feature-adapter-registry.js";
import type { FeatureAdapterRegistry } from "../runtimes/feature-adapter-registry.js";
import { withRuntimeTestProviderConfig } from "./runtime-config-file.js";

type ConfiguredTextRuntimeHarnessOptions = Partial<{
  config: LoadedRuntimeConfig;
  configDirectory: string;
  configPath: string;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  featureAdapterRegistry: FeatureAdapterRegistry;
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
    ...(options.configDirectory
      ? { configDirectory: options.configDirectory }
      : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
    ...(options.env ? { env: options.env } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.featureAdapterRegistry
      ? { featureAdapterRegistry: options.featureAdapterRegistry }
      : {}),
    now: options.now ?? (() => deterministicNow),
  });
}

export async function writeRuntimeHarnessConfig(
  config: unknown,
): Promise<string> {
  return writeTempJsonFile(
    withRuntimeTestProviderConfig(config),
    "personal-ai-runtime-",
  );
}

interface RuntimeConfigWithFeatures {
  features: Record<string, unknown>;
}

interface PersistentAlarmRuntimeConfigOptions {
  alarms?: ReadonlyArray<{
    id: string;
    label: string;
    scheduledFor: string;
  }>;
  statePath?: string;
}

export async function writePersistentAlarmRuntimeConfig(
  config: RuntimeConfigWithFeatures,
  options: PersistentAlarmRuntimeConfigOptions = {},
): Promise<{ configPath: string; statePath: string }> {
  const relativeStatePath = options.statePath ?? "state/alarms.json";
  const configPath = await writeRuntimeHarnessConfig({
    ...config,
    features: {
      ...config.features,
      alarms: {
        adapter: "file",
        enabled: true,
        state: { path: relativeStatePath },
      },
    },
  });
  const statePath = join(dirname(configPath), relativeStatePath);

  if (options.alarms) {
    await mkdir(dirname(statePath), { recursive: true });
    await writeFile(
      statePath,
      JSON.stringify({ alarms: options.alarms, version: 1 }),
    );
  }

  return { configPath, statePath };
}

export async function writePersistentTaskRuntimeConfig(
  config: RuntimeConfigWithFeatures,
  statePath = "state/tasks.json",
): Promise<{ configPath: string; statePath: string }> {
  const configPath = await writeRuntimeHarnessConfig({
    ...config,
    features: {
      ...config.features,
      tasks: {
        adapter: "file",
        enabled: true,
        state: { path: statePath },
      },
    },
  });

  return {
    configPath,
    statePath: join(dirname(configPath), statePath),
  };
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

export function createRuntimeConfigWithOpenAIConversationProvider(): LoadedRuntimeConfig {
  return withConversationProvider("openai", {
    apiKeyEnv: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.test/v1",
    model: "gpt-5.5",
    timeoutMs: 30_000,
  });
}

export function createRuntimeConfigWithOpenAIResponseRewriter(): LoadedRuntimeConfig {
  const openai = {
    apiKeyEnv: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.test/v1",
    model: "gpt-5.5",
    timeoutMs: 30_000,
  };

  return {
    ...enabledDeterministicConfig,
    responseRewriter: {
      provider: "openai",
      resolvedProvider:
        createDefaultResponseRewriterProviderRegistry().openai!.resolve({
          openai,
        }),
    },
  };
}

export function createRuntimeConfigWithUnknownConversationProvider(): LoadedRuntimeConfig {
  return withConversationProvider("unknown");
}

export function withConversationProvider(
  provider: string,
  openai?: OpenAIResponsesConfig,
  config: LoadedRuntimeConfig = enabledDeterministicConfig,
): LoadedRuntimeConfig {
  const rawConversation = {
    ...(openai ? { openai } : {}),
    provider,
  };

  return {
    ...config,
    conversation: {
      history: config.conversation.history,
      provider,
      resolvedProvider: resolveConfiguredRuntimeProvider({
        configuredId: provider,
        operationName: "conversation",
        rawOperationConfig: rawConversation,
        registry: createDefaultConversationProviderRegistry(),
      }),
    },
  };
}

export function createRuntimeConfigWithGoogleCalendarAdapter(
  dependencies: {
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
  } = {},
): LoadedRuntimeConfig {
  return parseAssistantConfig(
    {
      ...enabledDeterministicConfig,
      features: {
        calendar: {
          enabled: true,
          adapter: "google",
          eventGrouping: { provider: "mock" },
          upcomingWindowDays: 92,
          google: {
            accessTokenEnv: "GOOGLE_CALENDAR_ACCESS_TOKEN",
            baseUrl: "https://calendar.example.test/v3",
            calendarId: "primary",
            clientIdEnv: "GOOGLE_CALENDAR_CLIENT_ID",
            clientSecretEnv: "GOOGLE_CALENDAR_CLIENT_SECRET",
            maxResults: 10,
            refreshTokenEnv: "GOOGLE_CALENDAR_REFRESH_TOKEN",
            tokenUrl: "https://oauth2.googleapis.com/token",
            timeoutMs: 30_000,
          },
        },
        messaging: { adapter: "mock", enabled: true },
        alarms: { adapter: "local", enabled: true },
      },
    },
    {
      featureAdapterRegistry: createDefaultFeatureAdapterRegistry({
        calendar: {
          env: dependencies.env ?? {},
          fetch: dependencies.fetch ?? globalThis.fetch,
        },
      }),
    },
  );
}

export function createRuntimeConfigWithUnknownFeatureAdapter(): Record<
  string,
  unknown
> {
  return createRuntimeConfigWithRawFeatures({
    calendar: { adapter: "unknown", enabled: true },
  });
}

export function createRuntimeConfigWithMissingFeatureAdapter(): Record<
  string,
  unknown
> {
  return createRuntimeConfigWithRawFeatures({
    calendar: { enabled: true },
  });
}

export function createRuntimeConfigWithUnknownFeature(): Record<
  string,
  unknown
> {
  return createRuntimeConfigWithRawFeatures({
    notes: { adapter: "mock", enabled: true },
  });
}

export function createGoogleCalendarRuntimeConfigInput(): Record<
  string,
  unknown
> {
  return createRuntimeConfigWithRawFeatures({
    calendar: {
      adapter: "google",
      enabled: true,
      eventGrouping: { provider: "mock" },
      google: {
        accessTokenEnv: "GOOGLE_CALENDAR_ACCESS_TOKEN",
        baseUrl: "https://calendar.example.test/v3",
        calendarId: "primary",
        clientIdEnv: "GOOGLE_CALENDAR_CLIENT_ID",
        clientSecretEnv: "GOOGLE_CALENDAR_CLIENT_SECRET",
        maxResults: 10,
        refreshTokenEnv: "GOOGLE_CALENDAR_REFRESH_TOKEN",
        tokenUrl: "https://oauth2.googleapis.com/token",
        timeoutMs: 30_000,
      },
      upcomingWindowDays: 92,
    },
  });
}

export function withIntentProvider(
  provider: string,
  openai?: OpenAIResponsesConfig,
  config: LoadedRuntimeConfig = enabledDeterministicConfig,
): LoadedRuntimeConfig {
  const rawIntent = {
    provider,
    ...(openai ? { openai } : {}),
  };

  return {
    ...config,
    intent: {
      provider,
      resolvedProvider: resolveConfiguredRuntimeProvider({
        configuredId: provider,
        operationName: "intent",
        rawOperationConfig: rawIntent,
        registry: createDefaultIntentProviderRegistry(),
      }),
    },
  };
}

function createRuntimeConfigWithRawFeatures(
  features: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...enabledDeterministicConfig,
    features,
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
