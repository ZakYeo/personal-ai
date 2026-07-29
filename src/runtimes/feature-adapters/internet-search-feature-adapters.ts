import { createMockInternetSearch } from "../../adapters/mock/mock-internet-search.js";
import { resolveOpenAIApiKey } from "../../adapters/openai/openai-client.js";
import { createOpenAIWebSearch } from "../../adapters/openai/openai-web-search.js";
import { createInternetSearchFeature } from "../../features/internet-search/internet-search-feature.js";
import {
  defineFeatureAdapterEntry,
  type FeatureAdapterDependencies,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";
import {
  parseInternetSearchFeatureConfig,
  parseInternetSearchOpenAIAdapterConfig,
} from "./internet-search-feature-adapter-config.js";

export function createInternetSearchFeatureRegistryEntry(): FeatureRegistryEntry {
  return {
    adapters: {
      mock: defineFeatureAdapterEntry({
        create: ({ adapterConfig }) =>
          createInternetSearchFeature(createMockInternetSearch(), {
            maxResults: adapterConfig.maxResults,
          }),
        parseConfig: parseInternetSearchFeatureConfig,
        selectDependencies: () => ({}),
      }),
      openai: defineFeatureAdapterEntry({
        create: ({ adapterConfig, dependencies }) =>
          createInternetSearchFeature(
            createOpenAIWebSearch({
              config: adapterConfig.openai,
              env: dependencies.env,
              fetch: dependencies.fetch,
            }),
            { maxResults: adapterConfig.maxResults },
          ),
        parseConfig: parseInternetSearchOpenAIAdapterConfig,
        selectDependencies: selectProviderDependencies,
        validateStartup: ({ adapterConfig, dependencies }) => {
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

function selectProviderDependencies(dependencies: FeatureAdapterDependencies) {
  return { env: dependencies.env, fetch: dependencies.fetch };
}
