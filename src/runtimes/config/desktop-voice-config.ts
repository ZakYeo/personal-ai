import type { VoiceCommandConfig } from "../../ports/assistant.js";
import { isRecord } from "./config-parse-utils.js";

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
  voice: string;
}

export interface ParsedDesktopVoiceConfig {
  audioInput?: VoiceCommandConfig;
  audioOutput?: VoiceCommandConfig;
  openAIRealtimeTranscription?: OpenAIRealtimeTranscriptionConfig;
  openAIStreamingSpeech?: OpenAIStreamingSpeechConfig;
  speechToText?: VoiceCommandConfig;
  streamingAudioInput?: VoiceCommandConfig;
  streamingAudioOutput?: VoiceCommandConfig;
  textToSpeech?: VoiceCommandConfig;
  wakeActivation?: VoiceCommandConfig;
  wakeAudioInput?: VoiceCommandConfig;
}

interface ResolvedDesktopVoiceConfig {
  audioInput: VoiceCommandConfig;
  audioOutput: VoiceCommandConfig;
  openAIRealtimeTranscription?: OpenAIRealtimeTranscriptionConfig;
  openAIStreamingSpeech?: OpenAIStreamingSpeechConfig;
  speechToText: VoiceCommandConfig;
  streamingAudioInput?: VoiceCommandConfig;
  streamingAudioOutput?: VoiceCommandConfig;
  textToSpeech: VoiceCommandConfig;
  wakeActivation?: VoiceCommandConfig;
  wakeAudioInput?: VoiceCommandConfig;
}

export interface ResolvedDesktopStreamingSpeechToTextConfig {
  audioInput: VoiceCommandConfig;
  transcription: OpenAIRealtimeTranscriptionConfig;
}

export interface ResolvedDesktopStreamingTextToSpeechConfig {
  audioOutput: VoiceCommandConfig;
  speech: OpenAIStreamingSpeechConfig;
}

export interface ResolvedDesktopVoiceAdapterConfig {
  audioInput: VoiceCommandConfig;
  audioOutput: VoiceCommandConfig;
  speechToText: VoiceCommandConfig;
  streamingSpeechToText?: ResolvedDesktopStreamingSpeechToTextConfig;
  streamingTextToSpeech?: ResolvedDesktopStreamingTextToSpeechConfig;
  textToSpeech: VoiceCommandConfig;
  wakeActivation?: VoiceCommandConfig;
}

export interface ResolvedDesktopVoiceServiceAdapterConfig extends ResolvedDesktopVoiceAdapterConfig {
  wakeAudioInput: VoiceCommandConfig;
}

type ParsedDesktopVoiceCommandKey =
  | "audioInput"
  | "audioOutput"
  | "speechToText"
  | "streamingAudioInput"
  | "streamingAudioOutput"
  | "textToSpeech"
  | "wakeActivation"
  | "wakeAudioInput";

export function parseDesktopVoiceConfig(value: unknown): {
  desktopVoice?: ParsedDesktopVoiceConfig;
} {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error("Config desktopVoice section must be a JSON object.");
  }

  return {
    desktopVoice: {
      ...parseVoiceCommand("audioInput", value.audioInput),
      ...parseVoiceCommand("audioOutput", value.audioOutput),
      ...parseOpenAIRealtimeTranscriptionConfig(
        value.openAIRealtimeTranscription,
      ),
      ...parseOpenAIStreamingSpeechConfig(value.openAIStreamingSpeech),
      ...parseVoiceCommand("speechToText", value.speechToText),
      ...parseVoiceCommand("streamingAudioInput", value.streamingAudioInput),
      ...parseVoiceCommand("streamingAudioOutput", value.streamingAudioOutput),
      ...parseVoiceCommand("textToSpeech", value.textToSpeech),
      ...parseVoiceCommand("wakeActivation", value.wakeActivation),
      ...parseVoiceCommand("wakeAudioInput", value.wakeAudioInput),
    },
  };
}

export function requireDesktopVoiceConfig(config: {
  desktopVoice?: ParsedDesktopVoiceConfig;
}): ResolvedDesktopVoiceConfig {
  return {
    audioInput: requireDesktopVoiceCommand(config, "audioInput"),
    audioOutput: requireDesktopVoiceCommand(config, "audioOutput"),
    ...(config.desktopVoice?.openAIRealtimeTranscription
      ? {
          openAIRealtimeTranscription:
            config.desktopVoice.openAIRealtimeTranscription,
        }
      : {}),
    ...(config.desktopVoice?.openAIStreamingSpeech
      ? { openAIStreamingSpeech: config.desktopVoice.openAIStreamingSpeech }
      : {}),
    speechToText: requireDesktopVoiceCommand(config, "speechToText"),
    ...(config.desktopVoice?.streamingAudioInput
      ? { streamingAudioInput: config.desktopVoice.streamingAudioInput }
      : {}),
    ...(config.desktopVoice?.streamingAudioOutput
      ? { streamingAudioOutput: config.desktopVoice.streamingAudioOutput }
      : {}),
    textToSpeech: requireDesktopVoiceCommand(config, "textToSpeech"),
    ...(config.desktopVoice?.wakeActivation
      ? { wakeActivation: config.desktopVoice.wakeActivation }
      : {}),
    ...(config.desktopVoice?.wakeAudioInput
      ? { wakeAudioInput: config.desktopVoice.wakeAudioInput }
      : {}),
  };
}

function requireDesktopVoiceCommand(
  config: { desktopVoice?: ParsedDesktopVoiceConfig },
  key: ParsedDesktopVoiceCommandKey,
): VoiceCommandConfig {
  const command = config.desktopVoice?.[key];

  if (!command) {
    throw new Error(`Config desktopVoice.${key} must be configured.`);
  }

  return command;
}

export function requireDesktopVoiceCommandConfig(
  config: { desktopVoice?: ParsedDesktopVoiceConfig },
  key: ParsedDesktopVoiceCommandKey,
): VoiceCommandConfig {
  return requireDesktopVoiceCommand(config, key);
}

export function requireDesktopOpenAIRealtimeTranscriptionConfig(config: {
  desktopVoice?: ParsedDesktopVoiceConfig;
}): OpenAIRealtimeTranscriptionConfig {
  const providerConfig = config.desktopVoice?.openAIRealtimeTranscription;

  if (!providerConfig) {
    throw new Error(
      "Config desktopVoice.openAIRealtimeTranscription must be configured.",
    );
  }

  return providerConfig;
}

export function requireDesktopOpenAIStreamingSpeechConfig(config: {
  desktopVoice?: ParsedDesktopVoiceConfig;
}): OpenAIStreamingSpeechConfig {
  const providerConfig = config.desktopVoice?.openAIStreamingSpeech;

  if (!providerConfig) {
    throw new Error(
      "Config desktopVoice.openAIStreamingSpeech must be configured.",
    );
  }

  return providerConfig;
}

function parseVoiceCommand<TKey extends ParsedDesktopVoiceCommandKey>(
  key: TKey,
  value: unknown,
): Partial<Pick<ParsedDesktopVoiceConfig, TKey>> {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error(`Config desktopVoice.${key} must be a JSON object.`);
  }

  if (typeof value.command !== "string" || value.command.length === 0) {
    throw new Error(
      `Config desktopVoice.${key}.command must be a non-empty string.`,
    );
  }

  if (
    value.args !== undefined &&
    (!Array.isArray(value.args) ||
      !value.args.every((argument) => typeof argument === "string"))
  ) {
    throw new Error(`Config desktopVoice.${key}.args must be a string array.`);
  }

  const timeoutMs = value.timeoutMs;

  if (
    timeoutMs !== undefined &&
    (typeof timeoutMs !== "number" ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs <= 0)
  ) {
    throw new Error(
      `Config desktopVoice.${key}.timeoutMs must be a positive integer.`,
    );
  }

  return {
    [key]: {
      command: value.command,
      ...(value.args ? { args: value.args } : {}),
      ...(timeoutMs ? { timeoutMs } : {}),
    },
  } as Pick<ParsedDesktopVoiceConfig, TKey>;
}

function parseOpenAIRealtimeTranscriptionConfig(value: unknown): {
  openAIRealtimeTranscription?: OpenAIRealtimeTranscriptionConfig;
} {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error(
      "Config desktopVoice.openAIRealtimeTranscription must be a JSON object.",
    );
  }

  return {
    openAIRealtimeTranscription: {
      apiKeyEnv: parseOptionalString(
        value.apiKeyEnv,
        "desktopVoice.openAIRealtimeTranscription.apiKeyEnv",
        "OPENAI_API_KEY",
      ),
      baseUrl: parseOptionalString(
        value.baseUrl,
        "desktopVoice.openAIRealtimeTranscription.baseUrl",
        "wss://api.openai.com/v1/realtime",
      ),
      model: parseOpenAIRealtimeTranscriptionModel(value.model),
      timeoutMs: parseOptionalPositiveInteger(
        value.timeoutMs,
        "desktopVoice.openAIRealtimeTranscription.timeoutMs",
        30_000,
      ),
    },
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

function parseOpenAIStreamingSpeechConfig(value: unknown): {
  openAIStreamingSpeech?: OpenAIStreamingSpeechConfig;
} {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error(
      "Config desktopVoice.openAIStreamingSpeech must be a JSON object.",
    );
  }

  return {
    openAIStreamingSpeech: {
      apiKeyEnv: parseOptionalString(
        value.apiKeyEnv,
        "desktopVoice.openAIStreamingSpeech.apiKeyEnv",
        "OPENAI_API_KEY",
      ),
      baseUrl: parseOptionalString(
        value.baseUrl,
        "desktopVoice.openAIStreamingSpeech.baseUrl",
        "https://api.openai.com/v1",
      ),
      instructions: parseOptionalString(
        value.instructions,
        "desktopVoice.openAIStreamingSpeech.instructions",
        "Speak clearly and concisely.",
      ),
      model: parseRequiredString(
        value.model,
        "desktopVoice.openAIStreamingSpeech.model",
      ),
      responseFormat: parseOptionalString(
        value.responseFormat,
        "desktopVoice.openAIStreamingSpeech.responseFormat",
        "pcm",
      ),
      voice: parseRequiredString(
        value.voice,
        "desktopVoice.openAIStreamingSpeech.voice",
      ),
    },
  };
}

function parseRequiredString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Config ${key} must be a non-empty string.`);
  }

  return value;
}

function parseOptionalPositiveInteger(
  value: unknown,
  key: string,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Config ${key} must be a positive integer.`);
  }

  return value;
}

function parseOptionalString(
  value: unknown,
  key: string,
  defaultValue: string,
): string {
  if (value === undefined) {
    return defaultValue;
  }

  return parseRequiredString(value, key);
}
