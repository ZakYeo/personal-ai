import type { VoiceCommandConfig } from "../../ports/assistant.js";
import { isRecord } from "./config-parse-utils.js";
import type {
  DesktopVoiceProviderAdapterRegistry,
  DesktopVoiceProviderAdapterEntry,
  ResolvedDesktopVoiceProviderAdapter,
} from "../voice/desktop-voice-provider-adapter-registry.js";
import type {
  StreamingSpeechToTextPort,
  StreamingTextToSpeechPort,
} from "../../ports/voice.js";
import type { ParsedVoiceConfig } from "./voice-config.js";
import { selectConfiguredRuntimeEntry } from "../runtime-selector.js";

export interface ParsedDesktopVoiceConfig {
  audioInput?: VoiceCommandConfig;
  audioOutput?: VoiceCommandConfig;
  speechToText?: VoiceCommandConfig;
  streamingAudioInput?: VoiceCommandConfig;
  streamingAudioOutput?: VoiceCommandConfig;
  textToSpeech?: VoiceCommandConfig;
  wakeActivation?: VoiceCommandConfig;
  wakeAudioInput?: VoiceCommandConfig;
  streamingSpeechToTextProvider?: ResolvedDesktopVoiceProviderAdapter<StreamingSpeechToTextPort>;
  streamingTextToSpeechProvider?: ResolvedDesktopVoiceProviderAdapter<StreamingTextToSpeechPort>;
}

interface ResolvedDesktopVoiceConfig {
  audioInput: VoiceCommandConfig;
  audioOutput: VoiceCommandConfig;
  speechToText: VoiceCommandConfig;
  streamingAudioInput?: VoiceCommandConfig;
  streamingAudioOutput?: VoiceCommandConfig;
  textToSpeech: VoiceCommandConfig;
  wakeActivation?: VoiceCommandConfig;
  wakeAudioInput?: VoiceCommandConfig;
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

export function parseDesktopVoiceConfig(
  value: unknown,
  voice: ParsedVoiceConfig | undefined,
  providerRegistry: DesktopVoiceProviderAdapterRegistry,
): {
  desktopVoice?: ParsedDesktopVoiceConfig;
} {
  if (
    value === undefined &&
    !voice?.streamingSpeechToText &&
    !voice?.streamingTextToSpeech
  ) {
    return {};
  }

  if (value !== undefined && !isRecord(value)) {
    throw new Error("Config desktopVoice section must be a JSON object.");
  }

  const rawDesktopVoice = value ?? {};

  return {
    desktopVoice: {
      ...parseVoiceCommand("audioInput", rawDesktopVoice.audioInput),
      ...parseVoiceCommand("audioOutput", rawDesktopVoice.audioOutput),
      ...parseVoiceCommand("speechToText", rawDesktopVoice.speechToText),
      ...parseVoiceCommand(
        "streamingAudioInput",
        rawDesktopVoice.streamingAudioInput,
      ),
      ...parseVoiceCommand(
        "streamingAudioOutput",
        rawDesktopVoice.streamingAudioOutput,
      ),
      ...parseVoiceCommand("textToSpeech", rawDesktopVoice.textToSpeech),
      ...parseVoiceCommand("wakeActivation", rawDesktopVoice.wakeActivation),
      ...parseVoiceCommand("wakeAudioInput", rawDesktopVoice.wakeAudioInput),
      ...(voice?.streamingSpeechToText
        ? {
            streamingSpeechToTextProvider: resolveProviderConfig(
              voice.streamingSpeechToText,
              "streamingSpeechToText",
              providerRegistry.streamingSpeechToText,
              rawDesktopVoice,
            ),
          }
        : {}),
      ...(voice?.streamingTextToSpeech
        ? {
            streamingTextToSpeechProvider: resolveProviderConfig(
              voice.streamingTextToSpeech,
              "streamingTextToSpeech",
              providerRegistry.streamingTextToSpeech,
              rawDesktopVoice,
            ),
          }
        : {}),
    },
  };
}

function resolveProviderConfig<TAdapter>(
  configuredId: string,
  voiceKey: string,
  registry: Record<string, DesktopVoiceProviderAdapterEntry<TAdapter>>,
  rawDesktopVoice: Readonly<Record<string, unknown>>,
): ResolvedDesktopVoiceProviderAdapter<TAdapter> {
  const entry = selectConfiguredRuntimeEntry({
    configuredId,
    missingMessage: `Config voice.${voiceKey} must be configured.`,
    registry,
    unknownMessage: (id) =>
      `Config voice.${voiceKey} "${id}" is not registered.`,
  });

  return entry.resolve(rawDesktopVoice);
}

export function requireDesktopVoiceConfig(config: {
  desktopVoice?: ParsedDesktopVoiceConfig;
}): ResolvedDesktopVoiceConfig {
  return {
    audioInput: requireDesktopVoiceCommand(config, "audioInput"),
    audioOutput: requireDesktopVoiceCommand(config, "audioOutput"),
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
