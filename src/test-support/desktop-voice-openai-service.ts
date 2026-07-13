import type { LoadedRuntimeConfig } from "../runtimes/config/config.js";
import type { RealtimeSocketFactory } from "../adapters/openai/openai-realtime-transcription.js";
import { createDesktopVoiceProviderAdapterRegistry } from "../runtimes/voice/desktop-voice-provider-adapter-entries.js";
import { createDefaultIntentProviderRegistry } from "../runtimes/intent-provider-selection.js";
import { createDefaultConversationProviderRegistry } from "../runtimes/conversation-provider-selection.js";
import { TestRealtimeSocket } from "./adapter-contract.js";
import {
  createDesktopVoiceCommand,
  createDesktopVoiceConfig,
} from "./desktop-voice-runtime.js";

export function createOpenAIStreamingServiceConfig(
  options: {
    desktopVoice?: LoadedRuntimeConfig["desktopVoice"];
    timeoutMs?: number;
    webSocketFactory?: RealtimeSocketFactory;
  } = {},
): LoadedRuntimeConfig {
  const rawProviderConfig = {
    openAIRealtimeTranscription: {
      apiKeyEnv: "OPENAI_API_KEY",
      baseUrl: "wss://api.openai.test/v1/realtime",
      model: "gpt-realtime-whisper",
      timeoutMs: options.timeoutMs ?? 30_000,
    },
    openAIStreamingSpeech: {
      apiKeyEnv: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.test/v1",
      instructions: "Speak clearly.",
      model: "gpt-4o-mini-tts",
      responseFormat: "pcm",
      timeoutMs: 30_000,
      voice: "coral",
    },
  };
  const providerRegistry = createDesktopVoiceProviderAdapterRegistry({
    ...(options.webSocketFactory
      ? { openAIRealtimeWebSocketFactory: options.webSocketFactory }
      : {}),
  });

  return createDesktopVoiceConfig("", {
    desktopVoice: {
      streamingAudioInput: createDesktopVoiceCommand("printf command-audio"),
      streamingAudioOutput: createDesktopVoiceCommand("cat > /dev/null"),
      wakeActivation: createDesktopVoiceCommand(
        `printf '%s\\n' '{"type":"wake","phrase":"hey jarvis"}'`,
      ),
      streamingSpeechToTextProvider:
        providerRegistry.streamingSpeechToText["openai-realtime"]!.resolve(
          rawProviderConfig,
        ),
      streamingTextToSpeechProvider:
        providerRegistry.streamingTextToSpeech["openai-streaming"]!.resolve(
          rawProviderConfig,
        ),
      ...options.desktopVoice,
    },
    voice: {
      streamingAudioInput: "sox-rec-stream",
      streamingAudioOutput: "sox-play-stream",
      streamingSpeechToText: "openai-realtime",
      streamingTextToSpeech: "openai-streaming",
      wakeActivation: "openwakeword-command",
    },
  });
}

export function createOpenAIConversationStreamingServiceConfig(
  webSocketFactory?: RealtimeSocketFactory,
): LoadedRuntimeConfig {
  const openAIConfig = {
    apiKeyEnv: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.test/v1",
    model: "gpt-5.5",
    timeoutMs: 30_000,
  };

  return {
    ...createOpenAIStreamingServiceConfig({
      ...(webSocketFactory ? { webSocketFactory } : {}),
    }),
    conversation: {
      history: {
        maxTurnsBeforeCompaction: 5,
      },
      provider: "openai",
      resolvedProvider:
        createDefaultConversationProviderRegistry().openai!.resolve({
          openai: openAIConfig,
        }),
    },
    intent: {
      provider: "openai",
      resolvedProvider: createDefaultIntentProviderRegistry().openai!.resolve({
        openai: openAIConfig,
      }),
    },
  };
}

export function createQueuedRealtimeSocketFactory(transcripts: string[]): {
  sockets: TestRealtimeSocket[];
  webSocketFactory: RealtimeSocketFactory;
} {
  const sockets = transcripts.map(
    (transcript) =>
      new TestRealtimeSocket({
        autoOpen: true,
        transcript,
      }),
  );
  const pendingSockets = [...sockets];

  return {
    sockets,
    webSocketFactory: () => {
      const socket = pendingSockets.shift();

      if (!socket) {
        throw new Error("Unexpected transcription socket request.");
      }

      return socket;
    },
  };
}
