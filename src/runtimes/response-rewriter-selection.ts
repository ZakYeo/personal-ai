import { OpenAIResponseRewriter } from "../adapters/openai/openai-response-rewriter.js";
import type { AssistantDependencies } from "../core/assistant/index.js";
import type { LoadedRuntimeConfig } from "./config/config.js";
import {
  requireResponseRewriterConfig,
  type ResolvedResponseRewriterConfig,
} from "./config/response-rewriter-config.js";

interface ResponseRewriterDependencies {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

type ResponseRewriterFactory<
  TResponseRewriter extends ResolvedResponseRewriterConfig,
> = (context: {
  config: LoadedRuntimeConfig;
  dependencies: ResponseRewriterDependencies;
  responseRewriter: TResponseRewriter;
}) => AssistantDependencies["responseRewriter"];

type ResponseRewriterRegistry = {
  [TResponseRewriter in ResolvedResponseRewriterConfig as TResponseRewriter["provider"]]?: ResponseRewriterFactory<TResponseRewriter>;
};

interface CreateConfiguredResponseRewriterOptions {
  registry?: ResponseRewriterRegistry;
}

export function createConfiguredResponseRewriter(
  config: LoadedRuntimeConfig,
  dependencies: ResponseRewriterDependencies,
  options: CreateConfiguredResponseRewriterOptions = {},
): AssistantDependencies["responseRewriter"] {
  const responseRewriter = requireResponseRewriterConfig(config);
  const registry = options.registry ?? createDefaultResponseRewriterRegistry();
  const factory = registry[responseRewriter.provider] as
    | ResponseRewriterFactory<typeof responseRewriter>
    | undefined;

  if (!factory) {
    throw new Error(
      `Response rewriter provider "${responseRewriter.provider}" does not have a registered factory.`,
    );
  }

  return factory({
    config,
    dependencies,
    responseRewriter,
  });
}

function createDefaultResponseRewriterRegistry(): Required<ResponseRewriterRegistry> {
  return {
    disabled: () => noResponseRewriter,
    openai: ({ dependencies, responseRewriter }) =>
      new OpenAIResponseRewriter({
        config: responseRewriter.openai,
        env: dependencies.env,
        fetch: dependencies.fetch,
      }),
  };
}

const noResponseRewriter: AssistantDependencies["responseRewriter"] = undefined;
