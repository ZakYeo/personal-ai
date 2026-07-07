import type { LoadedRuntimeConfig } from "../runtimes/config/config.js";
import {
  createDesktopVoiceCommand,
  createDesktopVoiceConfig,
} from "./desktop-voice-runtime.js";

export function createOpenAIStreamingServiceConfig(
  options: {
    desktopVoice?: LoadedRuntimeConfig["desktopVoice"];
    timeoutMs?: number;
  } = {},
): LoadedRuntimeConfig {
  return createDesktopVoiceConfig("", {
    desktopVoice: {
      streamingAudioInput: createDesktopVoiceCommand("printf command-audio"),
      streamingAudioOutput: createDesktopVoiceCommand("cat > /dev/null"),
      wakeActivation: createDesktopVoiceCommand(
        `printf '%s\\n' '{"type":"wake","phrase":"hey jarvis"}'`,
      ),
      ...options.desktopVoice,
    },
    rawDesktopVoice: {
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
        voice: "coral",
      },
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
