import { OpenAIResponseRewriter } from "../adapters/openai/openai-response-rewriter.js";
import type { OpenAIResponsesConfig } from "../adapters/openai/openai-responses-config.js";
import type {
  ParsedResponseRewriterConfig,
  ResponseRewriterProviderDependencies,
  ResponseRewriterProviderRegistry,
} from "./config/response-rewriter-config.js";
import { parseOpenAIResponsesConfig } from "./config/openai-responses-config.js";
import { defineRuntimeProvider } from "./runtime-provider-registry.js";

export function createConfiguredResponseRewriter(
  config: { responseRewriter: ParsedResponseRewriterConfig },
  dependencies: ResponseRewriterProviderDependencies,
) {
  return config.responseRewriter.resolvedProvider.create(dependencies);
}

export function createDefaultResponseRewriterProviderRegistry(): ResponseRewriterProviderRegistry {
  return {
    disabled: defineRuntimeProvider({
      create: (providerConfig: void): undefined => {
        void providerConfig;

        return;
      },
      parseConfig: () => {},
    }),
    openai: defineRuntimeProvider({
      configKey: "openai",
      create: (
        providerConfig: OpenAIResponsesConfig,
        dependencies: ResponseRewriterProviderDependencies,
      ) =>
        new OpenAIResponseRewriter({
          config: providerConfig,
          env: dependencies.env,
          fetch: dependencies.fetch,
        }),
      parseConfig: (value) =>
        parseOpenAIResponsesConfig(value, "Config responseRewriter.openai"),
    }),
  };
}
