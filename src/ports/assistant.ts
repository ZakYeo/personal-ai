export type AssistantResponseStatus =
  | "ok"
  | "unknown"
  | "unsupported"
  | "invalid"
  | "needs_confirmation"
  | "error";

export interface AssistantResponse {
  status: AssistantResponseStatus;
  text: string;
}

export type AssistantCommandParameters = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface AssistantCommand {
  capability: string;
  parameters: AssistantCommandParameters;
  rawText: string;
}

export interface AssistantPolicyConfig {
  assistant: {
    name: string;
    wakePhrases: string[];
  };
  features: Record<
    string,
    {
      enabled: boolean;
      confirmationRequiredCapabilities?: string[];
    }
  >;
}

export interface OpenAIIntentConfig {
  apiKeyEnv: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface VoiceCommandConfig {
  args?: string[];
  command: string;
  timeoutMs?: number;
}

export interface AssistantContext {
  config: AssistantPolicyConfig;
  clock: ClockPort;
}

export interface ClockPort {
  now(): Date;
}
