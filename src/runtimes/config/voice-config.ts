import { isRecord } from "./config-parse-utils.js";

export interface ParsedVoiceConfig {
  audioOutput?: string;
  input?: string;
  speechToText?: string;
  streamingAudioInput?: string;
  streamingAudioOutput?: string;
  streamingSpeechToText?: string;
  streamingTextToSpeech?: string;
  textToSpeech?: string;
  wakeActivation?: string;
  wakeWord?: string;
}

interface ResolvedVoiceBaseConfig {
  audioOutput: string;
  input: string;
  speechToText: string;
  textToSpeech: string;
  wakeActivation?: string;
  wakeWord: string;
}

type ResolvedStreamingInputConfig =
  | { streamingAudioInput: string; streamingSpeechToText: string }
  | { streamingAudioInput?: never; streamingSpeechToText?: never };

type ResolvedStreamingOutputConfig =
  | { streamingAudioOutput: string; streamingTextToSpeech: string }
  | { streamingAudioOutput?: never; streamingTextToSpeech?: never };

export type ResolvedVoiceConfig = ResolvedVoiceBaseConfig &
  ResolvedStreamingInputConfig &
  ResolvedStreamingOutputConfig;

export function parseVoiceConfig(value: unknown): {
  voice?: ParsedVoiceConfig;
} {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error("Config voice section must be a JSON object.");
  }

  return {
    voice: {
      ...parseVoiceAdapter("input", value.input),
      ...parseVoiceAdapter("streamingAudioInput", value.streamingAudioInput),
      ...parseVoiceAdapter("streamingAudioOutput", value.streamingAudioOutput),
      ...parseVoiceAdapter(
        "streamingSpeechToText",
        value.streamingSpeechToText,
      ),
      ...parseVoiceAdapter(
        "streamingTextToSpeech",
        value.streamingTextToSpeech,
      ),
      ...parseVoiceAdapter("wakeActivation", value.wakeActivation),
      ...parseVoiceAdapter("wakeWord", value.wakeWord),
      ...parseVoiceAdapter("speechToText", value.speechToText),
      ...parseVoiceAdapter("textToSpeech", value.textToSpeech),
      ...parseVoiceAdapter("audioOutput", value.audioOutput),
    },
  };
}

export function requireVoiceConfig(config: {
  voice?: ParsedVoiceConfig;
}): ResolvedVoiceConfig {
  return {
    input: requireVoiceAdapterConfig(config, "input"),
    ...resolveStreamingPair(
      config.voice,
      "streamingAudioInput",
      "streamingSpeechToText",
    ),
    ...resolveStreamingPair(
      config.voice,
      "streamingAudioOutput",
      "streamingTextToSpeech",
    ),
    ...(config.voice?.wakeActivation
      ? { wakeActivation: config.voice.wakeActivation }
      : {}),
    wakeWord: requireVoiceAdapterConfig(config, "wakeWord"),
    speechToText: requireVoiceAdapterConfig(config, "speechToText"),
    textToSpeech: requireVoiceAdapterConfig(config, "textToSpeech"),
    audioOutput: requireVoiceAdapterConfig(config, "audioOutput"),
  };
}

function requireVoiceAdapterConfig(
  config: { voice?: ParsedVoiceConfig },
  key: keyof ParsedVoiceConfig,
): string {
  const adapterId = config.voice?.[key];

  if (adapterId === undefined) {
    throw new Error(`Config voice.${key} must be configured.`);
  }

  return adapterId;
}

type ResolvedStreamingPair<
  TFirst extends keyof ParsedVoiceConfig,
  TSecond extends keyof ParsedVoiceConfig,
> =
  | ({ [TKey in TFirst | TSecond]: string } & Record<never, never>)
  | { [TKey in TFirst | TSecond]?: never };

function resolveStreamingPair<
  TFirst extends keyof ParsedVoiceConfig,
  TSecond extends keyof ParsedVoiceConfig,
>(
  voice: ParsedVoiceConfig | undefined,
  firstKey: TFirst,
  secondKey: TSecond,
): ResolvedStreamingPair<TFirst, TSecond> {
  const firstAdapterId = voice?.[firstKey];
  const secondAdapterId = voice?.[secondKey];

  if (firstAdapterId === undefined && secondAdapterId === undefined) {
    return {};
  }

  if (firstAdapterId === undefined || secondAdapterId === undefined) {
    throw new Error(
      `Config voice.${firstKey} and voice.${secondKey} must be configured together.`,
    );
  }

  return {
    [firstKey]: firstAdapterId,
    [secondKey]: secondAdapterId,
  } as { [TKey in TFirst | TSecond]: string };
}

function parseVoiceAdapter<TKey extends keyof ParsedVoiceConfig>(
  key: TKey,
  value: unknown,
): Partial<Pick<ParsedVoiceConfig, TKey>> {
  if (value === undefined) {
    return {};
  }

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Config voice.${key} must be a non-empty string.`);
  }

  return {
    [key]: value,
  } as Pick<ParsedVoiceConfig, TKey>;
}
