import type { ResponseRewriterPort } from "../../ports/response-rewriter.js";
import {
  resolveConfiguredRuntimeProvider,
  type ResolvedRuntimeProvider,
  type RuntimeProviderEntry,
} from "../runtime-provider-registry.js";
import { isRecord } from "./config-parse-utils.js";

export interface ResponseRewriterProviderDependencies {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

export type ResponseRewriterProviderRegistry = Record<
  string,
  RuntimeProviderEntry<
    ResponseRewriterProviderDependencies,
    ResponseRewriterPort | undefined
  >
>;

export interface ParsedResponseRewriterConfig {
  provider: string;
  resolvedProvider: ResolvedRuntimeProvider<
    ResponseRewriterProviderDependencies,
    ResponseRewriterPort | undefined
  >;
}

export function parseResponseRewriterConfig(
  value: unknown,
  registry: ResponseRewriterProviderRegistry,
): ParsedResponseRewriterConfig {
  const rawResponseRewriter = value ?? { provider: "disabled" };

  if (!isRecord(rawResponseRewriter)) {
    throw new Error("Config responseRewriter must be a JSON object.");
  }

  if (
    typeof rawResponseRewriter.provider !== "string" ||
    rawResponseRewriter.provider.length === 0
  ) {
    throw new Error(
      "Config responseRewriter.provider must be a non-empty string.",
    );
  }

  return {
    provider: rawResponseRewriter.provider,
    resolvedProvider: resolveConfiguredRuntimeProvider({
      configuredId: rawResponseRewriter.provider,
      operationName: "responseRewriter",
      rawOperationConfig: rawResponseRewriter,
      registry,
    }),
  };
}

export function requireResponseRewriterConfig(config: {
  responseRewriter: ParsedResponseRewriterConfig;
}): ParsedResponseRewriterConfig {
  return config.responseRewriter;
}
