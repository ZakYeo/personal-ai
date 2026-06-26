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

export interface AssistantConfig {
  assistant: {
    name: string;
    wakePhrases: string[];
  };
  features: Record<string, { enabled: boolean }>;
}

export interface AssistantContext {
  config: AssistantConfig;
  clock: ClockPort;
}

export interface ClockPort {
  now(): Date;
}
