import { OpenAIRealtimeTranscription } from "../../adapters/openai/openai-realtime-transcription.js";
import { createOpenAIRealtimeWebSocketFactory } from "../../adapters/openai/openai-realtime-websocket.js";
import { OpenAIStreamingSpeech } from "../../adapters/openai/openai-streaming-speech.js";
import type { RealtimeSocketFactory } from "../../adapters/openai/openai-realtime-transcription.js";
import type {
  OpenAIRealtimeTranscriptionConfig,
  OpenAIStreamingSpeechConfig,
} from "../../adapters/openai/openai-streaming-voice-config.js";
import {
  parseDesktopOpenAIRealtimeTranscriptionConfig,
  parseDesktopOpenAIStreamingSpeechConfig,
} from "../config/desktop-voice-openai-config.js";
import {
  defineDesktopVoiceProviderAdapter,
  type DesktopVoiceProviderAdapterRegistry,
} from "./desktop-voice-provider-adapter-registry.js";

interface DesktopVoiceProviderAdapterOptions {
  openAIRealtimeWebSocketFactory?: RealtimeSocketFactory;
}

export function createDesktopVoiceProviderAdapterRegistry(
  options: DesktopVoiceProviderAdapterOptions = {},
): DesktopVoiceProviderAdapterRegistry {
  return {
    streamingSpeechToText: {
      "openai-realtime": defineDesktopVoiceProviderAdapter({
        configKey: "openAIRealtimeTranscription",
        create: (config: OpenAIRealtimeTranscriptionConfig, { dependencies }) =>
          new OpenAIRealtimeTranscription({
            config,
            env: dependencies.env,
            webSocketFactory:
              options.openAIRealtimeWebSocketFactory ??
              createOpenAIRealtimeWebSocketFactory,
          }),
        parseConfig: parseDesktopOpenAIRealtimeTranscriptionConfig,
      }),
    },
    streamingTextToSpeech: {
      "openai-streaming": defineDesktopVoiceProviderAdapter({
        configKey: "openAIStreamingSpeech",
        create: (config: OpenAIStreamingSpeechConfig, { dependencies }) =>
          new OpenAIStreamingSpeech({
            config,
            env: dependencies.env,
            fetch: dependencies.fetch,
          }),
        parseConfig: parseDesktopOpenAIStreamingSpeechConfig,
      }),
    },
  };
}
