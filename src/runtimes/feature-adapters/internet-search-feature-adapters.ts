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
import { internetSearchService } from "../feature-source-services.js";
import { bindRuntimeService } from "../runtime-service-registry.js";

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
        create: ({ adapterConfig }, services) =>
          createInternetSearchFeature(services.require(internetSearchService), {
            maxResults: adapterConfig.maxResults,
          }),
        provideServices: () => [
          bindRuntimeService(internetSearchService, createMockInternetSearch()),
        ],
      }),
      openai: openAIInternetSearchAdapter.bind({
        create: ({ adapterConfig }, services) =>
          createInternetSearchFeature(services.require(internetSearchService), {
            maxResults: adapterConfig.maxResults,
          }),
        provideServices: ({ adapterConfig }) => [
          bindRuntimeService(
            internetSearchService,
            createOpenAIWebSearch({
              config: adapterConfig.openai,
              env: dependencies.env,
              fetch: dependencies.fetch,
            }),
          ),
        ],
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
