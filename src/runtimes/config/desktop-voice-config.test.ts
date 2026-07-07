import { parseAssistantConfig, type LoadedRuntimeConfig } from "./config.js";
import { requireDesktopVoiceConfig } from "./desktop-voice-config.js";
import { requireVoiceConfig } from "./voice-config.js";
import { resolveDesktopVoiceAdapterConfig } from "../voice/desktop-voice-adapter-registry.js";

describe("desktop voice config parsing", () => {
  it("parses desktop voice command config", () => {
    const desktopVoice = {
      wakeAudioInput: {
        command: "fake-wake-rec",
        args: ["--output", "{output}"],
        timeoutMs: 1000,
      },
      wakeActivation: {
        command: "fake-openwakeword",
        args: ["--model", "hey_jarvis"],
      },
      streamingAudioInput: {
        command: "fake-stream-rec",
      },
      streamingAudioOutput: {
        command: "fake-stream-play",
      },
      openAIRealtimeTranscription: {
        model: "gpt-realtime-whisper",
      },
      openAIStreamingSpeech: {
        model: "gpt-4o-mini-tts",
        voice: "coral",
      },
      speechToText: {
        command: "fake-stt",
        args: ["--input", "{input}"],
        timeoutMs: 2000,
      },
      textToSpeech: {
        command: "fake-tts",
        args: ["--text", "{text}", "--output", "{output}"],
      },
    };

    expect(parseAssistantConfig(createMinimalConfig({ desktopVoice }))).toEqual(
      createMinimalConfig({
        desktopVoice,
      }),
    );
  });

  it("rejects invalid desktop voice command config", () => {
    expect(() =>
      parseAssistantConfig(
        createMinimalConfig({
          desktopVoice: {
            speechToText: {
              command: "",
            },
          },
        }),
      ),
    ).toThrow(
      "Config desktopVoice.speechToText.command must be a non-empty string.",
    );
  });

  it("rejects invalid desktop voice command args", () => {
    expect(() =>
      parseAssistantConfig(
        createMinimalConfig({
          desktopVoice: {
            textToSpeech: {
              command: "fake-tts",
              args: ["--text", 1],
            },
          },
        }),
      ),
    ).toThrow("Config desktopVoice.textToSpeech.args must be a string array.");
  });
});

describe("desktop voice config resolvers", () => {
  it("resolves selected desktop streaming adapter config into required bundles", () => {
    const config = createDesktopStreamingRuntimeConfig({
      desktopVoice: {
        openAIRealtimeTranscription: {
          model: "gpt-realtime-whisper",
        },
        openAIStreamingSpeech: {
          model: "gpt-4o-mini-tts",
          voice: "coral",
        },
        streamingAudioOutput: { command: "fake-stream-play" },
        wakeActivation: { command: "fake-wake" },
      },
      voice: {
        streamingAudioOutput: "sox-play-stream",
        streamingTextToSpeech: "openai-streaming",
        wakeActivation: "openwakeword-command",
      },
    });

    expect(
      resolveDesktopVoiceAdapterConfig(requireVoiceConfig(config), config),
    ).toMatchObject({
      streamingSpeechToText: {
        audioInput: { command: "fake-stream-rec" },
        transcription: {
          model: "gpt-realtime-whisper",
        },
      },
      streamingTextToSpeech: {
        audioOutput: { command: "fake-stream-play" },
        speech: {
          model: "gpt-4o-mini-tts",
          voice: "coral",
        },
      },
      wakeActivation: { command: "fake-wake" },
    });
  });

  it("rejects missing selected desktop streaming provider config at the config boundary", () => {
    const config = createDesktopStreamingRuntimeConfig();

    expect(() =>
      resolveDesktopVoiceAdapterConfig(requireVoiceConfig(config), config),
    ).toThrow(
      "Config desktopVoice.openAIRealtimeTranscription must be configured.",
    );
  });

  it("rejects unknown selected desktop streaming adapters before provider config requirements", () => {
    const config = createDesktopStreamingRuntimeConfig({
      voice: {
        streamingSpeechToText: "unknown",
      },
    });

    expect(() =>
      resolveDesktopVoiceAdapterConfig(requireVoiceConfig(config), config),
    ).toThrow(
      'Config voice.streamingSpeechToText "unknown" is not registered.',
    );
  });

  it("rejects unknown selected desktop wake activation adapters before wake command config requirements", () => {
    const config = parseAssistantConfig(
      createMinimalConfig({
        desktopVoice: {
          audioInput: { command: "fake-rec" },
          audioOutput: { command: "fake-play" },
          speechToText: { command: "fake-stt" },
          textToSpeech: { command: "fake-tts" },
        },
        voice: {
          audioOutput: "sox-play",
          input: "sox-rec",
          speechToText: "command",
          textToSpeech: "command",
          wakeActivation: "unknown",
          wakeWord: "text-prefix",
        },
      }),
    );

    expect(() =>
      resolveDesktopVoiceAdapterConfig(requireVoiceConfig(config), config),
    ).toThrow('Config voice.wakeActivation "unknown" is not registered.');
  });

  it("rejects invalid selected OpenAI realtime transcription timeout at the adapter resolver boundary", () => {
    const config = createDesktopStreamingRuntimeConfig({
      desktopVoice: {
        openAIRealtimeTranscription: {
          model: "gpt-realtime-whisper",
          timeoutMs: 0,
        },
      },
    });

    expect(() =>
      resolveDesktopVoiceAdapterConfig(requireVoiceConfig(config), config),
    ).toThrow(
      "Config desktopVoice.openAIRealtimeTranscription.timeoutMs must be a positive integer.",
    );
  });

  it("rejects non-realtime selected models for OpenAI realtime transcription at the adapter resolver boundary", () => {
    const config = createDesktopStreamingRuntimeConfig({
      desktopVoice: {
        openAIRealtimeTranscription: {
          model: "gpt-4o-transcribe",
        },
      },
    });

    expect(() =>
      resolveDesktopVoiceAdapterConfig(requireVoiceConfig(config), config),
    ).toThrow(
      "Config desktopVoice.openAIRealtimeTranscription.model must be gpt-realtime-whisper.",
    );
  });

  it("resolves required desktop voice command settings", () => {
    expect(
      requireDesktopVoiceConfig(
        parseAssistantConfig(
          createMinimalConfig({
            desktopVoice: {
              audioInput: { command: "fake-rec" },
              audioOutput: { command: "fake-play" },
              speechToText: { command: "fake-stt" },
              textToSpeech: { command: "fake-tts" },
            },
          }),
        ),
      ),
    ).toEqual({
      audioInput: { command: "fake-rec" },
      audioOutput: { command: "fake-play" },
      speechToText: { command: "fake-stt" },
      textToSpeech: { command: "fake-tts" },
    });
  });

  it("rejects missing required desktop voice command settings", () => {
    expect(() =>
      requireDesktopVoiceConfig(
        parseAssistantConfig(
          createMinimalConfig({
            desktopVoice: {
              audioInput: { command: "fake-rec" },
              speechToText: { command: "fake-stt" },
              textToSpeech: { command: "fake-tts" },
            },
          }),
        ),
      ),
    ).toThrow("Config desktopVoice.audioOutput must be configured.");
  });
});

function createMinimalConfig(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    assistant: {
      name: "Jarvis",
      wakePhrases: ["hey jarvis"],
    },
    intent: {
      provider: "deterministic",
    },
    features: {},
    ...overrides,
  };
}

function createDesktopStreamingRuntimeConfig(
  overrides: {
    desktopVoice?: Record<string, unknown>;
    voice?: Record<string, unknown>;
  } = {},
): LoadedRuntimeConfig {
  return parseAssistantConfig(
    createMinimalConfig({
      desktopVoice: {
        audioInput: { command: "fake-rec" },
        audioOutput: { command: "fake-play" },
        speechToText: { command: "fake-stt" },
        streamingAudioInput: { command: "fake-stream-rec" },
        textToSpeech: { command: "fake-tts" },
        ...overrides.desktopVoice,
      },
      voice: {
        audioOutput: "sox-play",
        input: "sox-rec",
        speechToText: "command",
        streamingAudioInput: "sox-rec-stream",
        streamingSpeechToText: "openai-realtime",
        textToSpeech: "command",
        wakeWord: "text-prefix",
        ...overrides.voice,
      },
    }),
  );
}
