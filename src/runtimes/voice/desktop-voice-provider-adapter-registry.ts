import type { ProcessingLocation } from "../processing-inspection.js";
import type { ProcessControl } from "../../ports/process-control.js";
import type {
  StreamingSpeechToTextPort,
  StreamingTextToSpeechPort,
  VoiceTempFilePort,
} from "../../ports/voice.js";

export interface DesktopVoiceAdapterRuntimeDependencies {
  env: Record<string, string | undefined>;
  fetch: typeof globalThis.fetch;
  processControl: ProcessControl;
  shutdownSignal?: AbortSignal;
}

export interface DesktopVoiceAdapterContext {
  dependencies: DesktopVoiceAdapterRuntimeDependencies;
  tempFiles: VoiceTempFilePort;
}

export interface ResolvedDesktopVoiceProviderAdapter<TAdapter> {
  readonly processing?: ProcessingLocation;
  create(context: DesktopVoiceAdapterContext): TAdapter;
}

interface DesktopVoiceProviderAdapterDefinition<TConfig, TAdapter> {
  processing?: ProcessingLocation;
  configKey: string;
  create(config: TConfig, context: DesktopVoiceAdapterContext): TAdapter;
  parseConfig(value: unknown): TConfig;
}

export interface DesktopVoiceProviderAdapterEntry<TAdapter> {
  resolve(
    rawDesktopVoiceConfig: Readonly<Record<string, unknown>>,
  ): ResolvedDesktopVoiceProviderAdapter<TAdapter>;
}

export interface DesktopVoiceProviderAdapterRegistry {
  streamingSpeechToText: Record<
    string,
    DesktopVoiceProviderAdapterEntry<StreamingSpeechToTextPort>
  >;
  streamingTextToSpeech: Record<
    string,
    DesktopVoiceProviderAdapterEntry<StreamingTextToSpeechPort>
  >;
}

export function defineDesktopVoiceProviderAdapter<TConfig, TAdapter>(
  entry: DesktopVoiceProviderAdapterDefinition<TConfig, TAdapter>,
): DesktopVoiceProviderAdapterEntry<TAdapter> {
  return {
    resolve: (rawDesktopVoiceConfig) => {
      const resolvedConfig = entry.parseConfig(
        rawDesktopVoiceConfig[entry.configKey],
      );

      return {
        ...(entry.processing ? { processing: entry.processing } : {}),
        create: (context) => entry.create(resolvedConfig, context),
      };
    },
  };
}
