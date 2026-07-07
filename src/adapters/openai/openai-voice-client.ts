interface OpenAIApiKeyConfig {
  apiKeyEnv: string;
}

export function resolveOpenAIApiKey(
  config: OpenAIApiKeyConfig,
  env: Record<string, string | undefined>,
): string {
  const apiKey = env[config.apiKeyEnv];

  if (!apiKey) {
    throw new Error(
      `OpenAI API key environment variable ${config.apiKeyEnv} is not set.`,
    );
  }

  return apiKey;
}

export function createOpenAIUrl(baseUrl: string, path: string): string {
  return new URL(path, ensureTrailingSlash(baseUrl)).toString();
}

export function createOpenAIStatusError(
  operation: string,
  status: number,
): Error {
  return new Error(`OpenAI ${operation} request failed with status ${status}.`);
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
