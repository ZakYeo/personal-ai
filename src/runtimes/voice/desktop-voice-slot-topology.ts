import type { ParsedDesktopVoiceConfig } from "../config/desktop-voice-config.js";
import type { ResolvedVoiceConfig } from "../config/voice-config.js";
import {
  selectConfiguredRuntimeEntry,
  selectConfiguredRuntimeEntryWithId,
} from "../runtime-selector.js";
import { desktopVoiceCommandAdapterEntries } from "./desktop-voice-command-adapter-entries.js";
import { desktopVoiceProviderAdapterEntries } from "./desktop-voice-provider-adapter-entries.js";
import type {
  DesktopVoiceAdapterContext,
  DesktopVoiceAdapterEntry,
  DesktopVoiceProviderSlotDescriptor,
  ResolvedDesktopVoiceProviderAdapter,
  DesktopVoiceSlotDescriptor,
  DesktopVoiceSlotTopology,
} from "./desktop-voice-adapter-types.js";

export const desktopVoiceSlotTopology = {
  audioInput: {
    registry: desktopVoiceCommandAdapterEntries.input,
    voiceKey: "input",
  },
  audioOutput: {
    registry: desktopVoiceCommandAdapterEntries.audioOutput,
    voiceKey: "audioOutput",
  },
  speechToText: {
    registry: desktopVoiceCommandAdapterEntries.speechToText,
    voiceKey: "speechToText",
  },
  streamingAudioInput: {
    registry: desktopVoiceCommandAdapterEntries.streamingAudioInput,
    voiceKey: "streamingAudioInput",
  },
  streamingAudioOutput: {
    registry: desktopVoiceCommandAdapterEntries.streamingAudioOutput,
    voiceKey: "streamingAudioOutput",
  },
  streamingSpeechToText: {
    registry: desktopVoiceProviderAdapterEntries.streamingSpeechToText,
    voiceKey: "streamingSpeechToText",
  },
  streamingTextToSpeech: {
    registry: desktopVoiceProviderAdapterEntries.streamingTextToSpeech,
    voiceKey: "streamingTextToSpeech",
  },
  textToSpeech: {
    registry: desktopVoiceCommandAdapterEntries.textToSpeech,
    voiceKey: "textToSpeech",
  },
  wakeActivation: {
    registry: desktopVoiceCommandAdapterEntries.wakeActivation,
    voiceKey: "wakeActivation",
  },
  wakeWord: {
    registry: desktopVoiceCommandAdapterEntries.wakeWord,
    voiceKey: "wakeWord",
  },
} satisfies DesktopVoiceSlotTopology;

export function resolveDesktopVoiceSlotConfig<TConfig, TAdapter>(
  voice: ResolvedVoiceConfig,
  descriptor: DesktopVoiceSlotDescriptor<TConfig, TAdapter>,
  config: {
    desktopVoice?: ParsedDesktopVoiceConfig;
  },
): TConfig {
  return selectConfiguredDesktopVoiceAdapter(voice, descriptor).resolveConfig(
    config,
  );
}

export function createDesktopVoiceSlotAdapter<TConfig, TAdapter>(
  voice: ResolvedVoiceConfig,
  descriptor: DesktopVoiceSlotDescriptor<TConfig, TAdapter>,
  config: TConfig,
  context: DesktopVoiceAdapterContext,
): TAdapter {
  return selectConfiguredDesktopVoiceAdapter(voice, descriptor).create(
    config,
    context,
  );
}

export function resolveDesktopVoiceProviderSlot<TAdapter>(
  voice: ResolvedVoiceConfig,
  descriptor: DesktopVoiceProviderSlotDescriptor<TAdapter>,
  config: { desktopVoice?: ParsedDesktopVoiceConfig },
): ResolvedDesktopVoiceProviderAdapter<TAdapter> {
  const selected = selectConfiguredRuntimeEntryWithId({
    configuredId: voice[descriptor.voiceKey],
    missingMessage: `Config voice.${descriptor.voiceKey} must be configured.`,
    registry: descriptor.registry,
    unknownMessage: (configuredId) =>
      `Config voice.${descriptor.voiceKey} "${configuredId}" is not registered.`,
  });

  return {
    adapterId: selected.configuredId,
    ...selected.entry.resolve(config),
  };
}

function selectConfiguredDesktopVoiceAdapter<TConfig, TAdapter>(
  voice: ResolvedVoiceConfig,
  descriptor: DesktopVoiceSlotDescriptor<TConfig, TAdapter>,
): DesktopVoiceAdapterEntry<TConfig, TAdapter> {
  return selectConfiguredRuntimeEntry({
    configuredId: voice[descriptor.voiceKey],
    missingMessage: `Config voice.${descriptor.voiceKey} must be configured.`,
    registry: descriptor.registry,
    unknownMessage: (configuredId) =>
      `Config voice.${descriptor.voiceKey} "${configuredId}" is not registered.`,
  });
}
