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
  model: string;
  responseFormat: string;
  timeoutMs: number;
  voice: string;
}
