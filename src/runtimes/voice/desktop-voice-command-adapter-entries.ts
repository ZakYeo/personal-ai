import {
  CommandSpeechToText,
  CommandTextToSpeech,
  CommandWakeActivation,
  SoxAudioInput,
  SoxAudioOutput,
  TextPrefixWakeWordDetector,
} from "../../adapters/desktop/desktop-voice-adapters.js";
import {
  CommandStreamingAudioInput,
  CommandStreamingAudioOutput,
} from "../../adapters/desktop/desktop-streaming-voice-adapters.js";
import type { VoiceCommandConfig } from "../../ports/assistant.js";
import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  StreamingAudioInputPort,
  StreamingAudioOutputPort,
  TextToSpeechPort,
  WakeActivationPort,
  WakeWordPort,
} from "../../ports/voice.js";
import { requireDesktopVoiceCommandConfig } from "../config/desktop-voice-config.js";
import {
  defineDesktopVoiceAdapter,
  type DesktopVoiceAdapterEntry,
} from "./desktop-voice-adapter-types.js";

export const desktopVoiceCommandAdapterEntries = {
  audioOutput: {
    "sox-play": defineDesktopVoiceAdapter({
      create: (command: VoiceCommandConfig, context) =>
        new SoxAudioOutput(command, context.dependencies.processControl),
      resolveConfig: (config) =>
        requireDesktopVoiceCommandConfig(config, "audioOutput"),
    }),
  },
  input: {
    "sox-rec": defineDesktopVoiceAdapter({
      create: (command: VoiceCommandConfig, context) =>
        new SoxAudioInput(
          command,
          context.tempFiles,
          context.dependencies.processControl,
          context.dependencies.shutdownSignal,
        ),
      resolveConfig: (config) =>
        requireDesktopVoiceCommandConfig(config, "audioInput"),
    }),
  },
  speechToText: {
    command: defineDesktopVoiceAdapter({
      create: (command: VoiceCommandConfig, context) =>
        new CommandSpeechToText(
          command,
          context.dependencies.processControl,
          context.dependencies.shutdownSignal,
        ),
      resolveConfig: (config) =>
        requireDesktopVoiceCommandConfig(config, "speechToText"),
    }),
  },
  streamingAudioInput: {
    "sox-rec-stream": defineDesktopVoiceAdapter({
      create: (command: VoiceCommandConfig, context) =>
        new CommandStreamingAudioInput(
          command,
          context.dependencies.processControl,
          context.dependencies.shutdownSignal,
        ),
      resolveConfig: (config) =>
        requireDesktopVoiceCommandConfig(config, "streamingAudioInput"),
    }),
  },
  streamingAudioOutput: {
    "sox-play-stream": defineDesktopVoiceAdapter({
      create: (command: VoiceCommandConfig, context) =>
        new CommandStreamingAudioOutput(
          command,
          context.dependencies.processControl,
        ),
      resolveConfig: (config) =>
        requireDesktopVoiceCommandConfig(config, "streamingAudioOutput"),
    }),
  },
  textToSpeech: {
    command: defineDesktopVoiceAdapter({
      create: (command: VoiceCommandConfig, context) =>
        new CommandTextToSpeech(
          command,
          context.tempFiles,
          context.dependencies.processControl,
        ),
      resolveConfig: (config) =>
        requireDesktopVoiceCommandConfig(config, "textToSpeech"),
    }),
  },
  wakeActivation: {
    "openwakeword-command": defineDesktopVoiceAdapter({
      create: (command: VoiceCommandConfig, context) =>
        new CommandWakeActivation(
          command,
          context.dependencies.processControl,
          context.dependencies.shutdownSignal,
        ),
      resolveConfig: (config) =>
        requireDesktopVoiceCommandConfig(config, "wakeActivation"),
    }),
  },
  wakeWord: {
    "text-prefix": defineDesktopVoiceAdapter({
      create: () => new TextPrefixWakeWordDetector(),
      resolveConfig: () => {},
    }),
  },
} satisfies {
  audioOutput: Record<
    string,
    DesktopVoiceAdapterEntry<VoiceCommandConfig, AudioOutputPort>
  >;
  input: Record<
    string,
    DesktopVoiceAdapterEntry<VoiceCommandConfig, AudioInputPort>
  >;
  speechToText: Record<
    string,
    DesktopVoiceAdapterEntry<VoiceCommandConfig, SpeechToTextPort>
  >;
  streamingAudioInput: Record<
    string,
    DesktopVoiceAdapterEntry<VoiceCommandConfig, StreamingAudioInputPort>
  >;
  streamingAudioOutput: Record<
    string,
    DesktopVoiceAdapterEntry<VoiceCommandConfig, StreamingAudioOutputPort>
  >;
  textToSpeech: Record<
    string,
    DesktopVoiceAdapterEntry<VoiceCommandConfig, TextToSpeechPort>
  >;
  wakeActivation: Record<
    string,
    DesktopVoiceAdapterEntry<VoiceCommandConfig, WakeActivationPort>
  >;
  wakeWord: Record<string, DesktopVoiceAdapterEntry<void, WakeWordPort>>;
};
