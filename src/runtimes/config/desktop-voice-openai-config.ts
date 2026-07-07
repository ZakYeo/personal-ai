import {
  isRecord,
  parseOptionalNonEmptyString,
  parseOptionalPositiveInteger,
} from "./config-parse-utils.js";
import type { ParsedDesktopVoiceConfig } from "./desktop-voice-config.js";
import type {
  OpenAIRealtimeTranscriptionConfig,
  OpenAIStreamingSpeechConfig,
} from "./desktop-voice-openai-types.js";

export function requireDesktopOpenAIRealtimeTranscriptionConfig(config: {
  desktopVoice?: ParsedDesktopVoiceConfig;
}): OpenAIRealtimeTranscriptionConfig {
  const value = config.desktopVoice?.openAIRealtimeTranscription;

  if (value === undefined) {
    throw new Error(
      "Config desktopVoice.openAIRealtimeTranscription must be configured.",
    );
  }

  if (!isRecord(value)) {
    throw new Error(
      "Config desktopVoice.openAIRealtimeTranscription must be a JSON object.",
    );
  }

  return {
    apiKeyEnv: parseOptionalNonEmptyString(
      value.apiKeyEnv,
      "Config desktopVoice.openAIRealtimeTranscription.apiKeyEnv must be a non-empty string.",
      "OPENAI_API_KEY",
    ),
    baseUrl: parseOptionalNonEmptyString(
      value.baseUrl,
      "Config desktopVoice.openAIRealtimeTranscription.baseUrl must be a non-empty string.",
      "wss://api.openai.com/v1/realtime",
    ),
    model: parseOpenAIRealtimeTranscriptionModel(value.model),
    timeoutMs: parseOptionalPositiveInteger(
      value.timeoutMs,
      "Config desktopVoice.openAIRealtimeTranscription.timeoutMs must be a positive integer.",
      30_000,
    ),
  };
}

export function requireDesktopOpenAIStreamingSpeechConfig(config: {
  desktopVoice?: ParsedDesktopVoiceConfig;
}): OpenAIStreamingSpeechConfig {
  const value = config.desktopVoice?.openAIStreamingSpeech;

  if (value === undefined) {
    throw new Error(
      "Config desktopVoice.openAIStreamingSpeech must be configured.",
    );
  }

  if (!isRecord(value)) {
    throw new Error(
      "Config desktopVoice.openAIStreamingSpeech must be a JSON object.",
    );
  }

  return {
    apiKeyEnv: parseOptionalNonEmptyString(
      value.apiKeyEnv,
      "Config desktopVoice.openAIStreamingSpeech.apiKeyEnv must be a non-empty string.",
      "OPENAI_API_KEY",
    ),
    baseUrl: parseOptionalNonEmptyString(
      value.baseUrl,
      "Config desktopVoice.openAIStreamingSpeech.baseUrl must be a non-empty string.",
      "https://api.openai.com/v1",
    ),
    instructions: parseOptionalNonEmptyString(
      value.instructions,
      "Config desktopVoice.openAIStreamingSpeech.instructions must be a non-empty string.",
      "Speak clearly and concisely.",
    ),
    model: parseRequiredString(
      value.model,
      "desktopVoice.openAIStreamingSpeech.model",
    ),
    responseFormat: parseOptionalNonEmptyString(
      value.responseFormat,
      "Config desktopVoice.openAIStreamingSpeech.responseFormat must be a non-empty string.",
      "pcm",
    ),
    voice: parseRequiredString(
      value.voice,
      "desktopVoice.openAIStreamingSpeech.voice",
    ),
  };
}

function parseOpenAIRealtimeTranscriptionModel(value: unknown): string {
  const model = parseRequiredString(
    value,
    "desktopVoice.openAIRealtimeTranscription.model",
  );

  if (model !== "gpt-realtime-whisper") {
    throw new Error(
      "Config desktopVoice.openAIRealtimeTranscription.model must be gpt-realtime-whisper.",
    );
  }

  return model;
}

function parseRequiredString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Config ${key} must be a non-empty string.`);
  }

  return value;
}
