import type { AssistantContext } from "../ports/assistant.js";
import { OpenAIIntentInterpreter } from "../adapters/openai/openai-intent-interpreter.js";
import type { OpenAIIntentCapability } from "../adapters/openai/openai-intent-interpreter.js";
import type { OpenAIIntentRequestBody } from "../adapters/openai/openai-responses-request.js";
import {
  createProviderCredentialEnv,
  readJsonRequestBody,
} from "./adapter-contract.js";
import { deterministicTestNow } from "./primitives.js";

export const openAIIntentContext = {
  clock: {
    now: () => deterministicTestNow,
  },
  config: {
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    features: {
      calendar: { enabled: true },
    },
  },
} satisfies AssistantContext;

interface CreateOpenAIIntentInterpreterOptions {
  capabilityCatalog?: readonly OpenAIIntentCapability[];
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createOpenAIIntentInterpreter(
  options: CreateOpenAIIntentInterpreterOptions = {},
) {
  return new OpenAIIntentInterpreter({
    ...(options.capabilityCatalog
      ? { capabilityCatalog: options.capabilityCatalog }
      : {}),
    config: {
      apiKeyEnv: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.test/v1",
      model: "gpt-5.5",
      reasoningEffort: "none" as const,
      timeoutMs: options.timeoutMs ?? 30_000,
    },
    env:
      options.env ??
      createProviderCredentialEnv("OPENAI_API_KEY", "test-api-key"),
    fetch: options.fetch ?? vi.fn(),
  });
}

export function readOpenAIIntentRequestBody(
  fetch: typeof globalThis.fetch,
): OpenAIIntentRequestBody {
  return readJsonRequestBody<OpenAIIntentRequestBody>(fetch);
}

export function openAIIntentOutput(interpretation: unknown): string {
  return JSON.stringify({ interpretation });
}
