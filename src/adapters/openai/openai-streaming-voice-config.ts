export interface OpenAIRealtimeTranscriptionConfig {
  apiKeyEnv: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface OpenAIStreamingSpeechConfig {
  apiKeyEnv: string;
  baseUrl: string;
  instructions: string;
  maxAudioBytes: number;
  model: string;
  responseFormat: string;
  timeoutMs: number;
  voice: string;
}

export const defaultOpenAIStreamingSpeechMaxAudioBytes = 16 * 1024 * 1024;
