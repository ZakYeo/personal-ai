import { createMockCalendarEventGrouper } from "../../adapters/mock/mock-calendar-event-grouper.js";
import { resolveOpenAIApiKey } from "../../adapters/openai/openai-client.js";
import { OpenAICalendarEventGrouper } from "../../adapters/openai/openai-calendar-event-grouper.js";
import type { OpenAIResponsesConfig } from "../../adapters/openai/openai-responses-config.js";
import type { CalendarEventGrouperPort } from "../../ports/calendar-event-grouper.js";
import { isRecord } from "../config/config-parse-utils.js";
import { parseOpenAIResponsesConfig } from "../config/openai-responses-config.js";
import {
  defineConfiglessRuntimeProvider,
  defineRuntimeProvider,
  resolveConfiguredRuntimeProvider,
  type ResolvedRuntimeProvider,
  type RuntimeProviderEntry,
} from "../runtime-provider-registry.js";

export interface CalendarEventGrouperProviderDependencies {
  readonly env: Record<string, string | undefined>;
  readonly fetch: typeof fetch;
}

export interface CalendarEventGrouperProviderBinding {
  readonly grouper: CalendarEventGrouperPort;
  validateStartup(): void;
}

export type ResolvedCalendarEventGrouperProvider = ResolvedRuntimeProvider<
  CalendarEventGrouperProviderDependencies,
  CalendarEventGrouperProviderBinding
>;

type CalendarEventGrouperProviderRegistry = Record<
  string,
  RuntimeProviderEntry<
    CalendarEventGrouperProviderDependencies,
    CalendarEventGrouperProviderBinding
  >
>;

export function resolveCalendarEventGrouperProvider(
  value: unknown,
): ResolvedCalendarEventGrouperProvider {
  if (!isRecord(value)) {
    throw new Error(
      'Config feature "calendar".eventGrouping must be a JSON object.',
    );
  }
  return resolveConfiguredRuntimeProvider({
    configuredId: typeof value.provider === "string" ? value.provider : "",
    operationName: 'feature "calendar".eventGrouping',
    rawOperationConfig: value,
    registry: calendarEventGrouperProviderRegistry,
  });
}

const calendarEventGrouperProviderRegistry: CalendarEventGrouperProviderRegistry =
  {
    mock: defineConfiglessRuntimeProvider(() => ({
      grouper: createMockCalendarEventGrouper(),
      validateStartup: () => {},
    })),
    openai: defineRuntimeProvider({
      configKey: "openai",
      create: (
        config: OpenAIResponsesConfig,
        dependencies: CalendarEventGrouperProviderDependencies,
      ) => ({
        grouper: new OpenAICalendarEventGrouper({
          config,
          env: dependencies.env,
          fetch: dependencies.fetch,
        }),
        validateStartup: () => {
          resolveOpenAIApiKey(
            config,
            dependencies.env,
            (message) =>
              new Error(
                message.replace(
                  "OpenAI API key environment variable",
                  "OpenAI calendar event grouper is selected but",
                ),
              ),
          );
        },
      }),
      parseConfig: (rawConfig) =>
        parseOpenAIResponsesConfig(
          rawConfig,
          'Config feature "calendar".eventGrouping.openai',
        ),
    }),
  };
