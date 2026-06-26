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
  desktopVoice?: {
    audioInput?: VoiceCommandConfig;
    audioOutput?: VoiceCommandConfig;
    speechToText?: VoiceCommandConfig;
    textToSpeech?: VoiceCommandConfig;
  };
  voice?: {
    input?: string;
    wakeWord?: string;
    speechToText?: string;
    textToSpeech?: string;
    audioOutput?: string;
  };
  intent: {
    provider: string;
  };
  features: Record<
    string,
    {
      enabled: boolean;
      adapter?: string;
      confirmationRequiredCapabilities?: string[];
    }
  >;
}

export interface VoiceCommandConfig {
  args?: string[];
  command: string;
  timeoutMs?: number;
}

export interface AssistantContext {
  config: AssistantConfig;
  clock: ClockPort;
}

export interface ClockPort {
  now(): Date;
}
