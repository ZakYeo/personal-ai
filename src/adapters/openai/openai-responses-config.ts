const openAIReasoningEfforts = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type OpenAIReasoningEffort = (typeof openAIReasoningEfforts)[number];

export interface OpenAIResponsesConfig {
  apiKeyEnv: string;
  baseUrl: string;
  model: string;
  reasoningEffort?: OpenAIReasoningEffort;
  timeoutMs: number;
}

export function createOpenAIReasoningRequestConfig(
  config: OpenAIResponsesConfig,
): { reasoning?: { effort: OpenAIReasoningEffort } } {
  return config.reasoningEffort
    ? { reasoning: { effort: config.reasoningEffort } }
    : {};
}

export function isOpenAIReasoningEffort(
  value: unknown,
): value is OpenAIReasoningEffort {
  return openAIReasoningEfforts.some((effort) => effort === value);
}
