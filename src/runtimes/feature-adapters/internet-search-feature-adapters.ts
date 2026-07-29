import { createMockInternetSearch } from "../../adapters/mock/mock-internet-search.js";
import { resolveOpenAIApiKey } from "../../adapters/openai/openai-client.js";
import { createOpenAIWebSearch } from "../../adapters/openai/openai-web-search.js";
import { createInternetSearchFeature } from "../../features/internet-search/internet-search-feature.js";
import {
  defineFeatureAdapter,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";
import {
  parseInternetSearchFeatureConfig,
  parseInternetSearchOpenAIAdapterConfig,
} from "./internet-search-feature-adapter-config.js";

interface InternetSearchFeatureRegistryDependencies {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

const mockInternetSearchAdapter = defineFeatureAdapter({
  parseConfig: parseInternetSearchFeatureConfig,
});
const openAIInternetSearchAdapter = defineFeatureAdapter({
  parseConfig: parseInternetSearchOpenAIAdapterConfig,
});

export function createInternetSearchFeatureRegistryEntry(
  dependencies: InternetSearchFeatureRegistryDependencies,
): FeatureRegistryEntry {
  return {
    adapters: {
      mock: mockInternetSearchAdapter.bind({
        create: ({ adapterConfig }) =>
          createInternetSearchFeature(createMockInternetSearch(), {
            maxResults: adapterConfig.maxResults,
          }),
      }),
      openai: openAIInternetSearchAdapter.bind({
        create: ({ adapterConfig }) =>
          createInternetSearchFeature(
            createOpenAIWebSearch({
              config: adapterConfig.openai,
              env: dependencies.env,
              fetch: dependencies.fetch,
            }),
            { maxResults: adapterConfig.maxResults },
          ),
        validateStartup: (adapterConfig) => {
          resolveOpenAIApiKey(
            adapterConfig.openai,
            dependencies.env,
            (message) =>
              new Error(
                message.replace(
                  "OpenAI API key environment variable",
                  "OpenAI web search is selected but",
                ),
              ),
          );
        },
      }),
    },
  };
}
