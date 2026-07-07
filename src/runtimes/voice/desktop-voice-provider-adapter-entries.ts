import {
  OpenAIRealtimeTranscription,
  type RealtimeSocketFactory,
} from "../../adapters/openai/openai-realtime-transcription.js";
import { createOpenAIRealtimeWebSocketFactory } from "../../adapters/openai/openai-realtime-websocket.js";
import { OpenAIStreamingSpeech } from "../../adapters/openai/openai-streaming-speech.js";
import type {
  StreamingSpeechToTextPort,
  StreamingTextToSpeechPort,
} from "../../ports/voice.js";
import type {
  OpenAIRealtimeTranscriptionConfig,
  OpenAIStreamingSpeechConfig,
} from "../config/desktop-voice-config.js";
import {
  requireDesktopOpenAIRealtimeTranscriptionConfig,
  requireDesktopOpenAIStreamingSpeechConfig,
} from "../config/desktop-voice-config.js";
import {
  defineDesktopVoiceAdapter,
  type DesktopVoiceAdapterEntry,
} from "./desktop-voice-adapter-types.js";

export type { RealtimeSocketFactory };

export const desktopVoiceProviderAdapterEntries = {
  streamingSpeechToText: {
    "openai-realtime": defineDesktopVoiceAdapter({
      create: (config: OpenAIRealtimeTranscriptionConfig, { dependencies }) =>
        new OpenAIRealtimeTranscription({
          config,
          env: dependencies.env,
          webSocketFactory:
            dependencies.webSocketFactory ??
            createOpenAIRealtimeWebSocketFactory,
        }),
      resolveConfig: requireDesktopOpenAIRealtimeTranscriptionConfig,
    }),
  },
  streamingTextToSpeech: {
    "openai-streaming": defineDesktopVoiceAdapter({
      create: (config: OpenAIStreamingSpeechConfig, { dependencies }) =>
        new OpenAIStreamingSpeech({
          config,
          env: dependencies.env,
          fetch: dependencies.fetch,
        }),
      resolveConfig: requireDesktopOpenAIStreamingSpeechConfig,
    }),
  },
} satisfies {
  streamingSpeechToText: Record<
    string,
    DesktopVoiceAdapterEntry<
      OpenAIRealtimeTranscriptionConfig,
      StreamingSpeechToTextPort
    >
  >;
  streamingTextToSpeech: Record<
    string,
    DesktopVoiceAdapterEntry<
      OpenAIStreamingSpeechConfig,
      StreamingTextToSpeechPort
    >
  >;
};
