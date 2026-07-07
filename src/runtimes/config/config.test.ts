import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, parseAssistantConfig } from "./config.js";
import { requireDesktopVoiceConfig } from "./desktop-voice-config.js";
import { requireIntentConfig } from "./intent-config.js";
import { requireVoiceConfig } from "./voice-config.js";
import { resolveDesktopVoiceAdapterConfig } from "../voice/desktop-voice-adapter-registry.js";

describe("loadConfig", () => {
  it("loads the default checked-in config", async () => {
    await expect(loadConfig()).resolves.toEqual({
      assistant: {
        name: "Jarvis",
        wakePhrases: ["hey jarvis"],
      },
      intent: {
        provider: "deterministic",
      },
      voice: {
        input: "mock",
        wakeWord: "mock",
        speechToText: "mock",
        textToSpeech: "mock",
        audioOutput: "mock",
      },
      features: {
        calendar: { enabled: true, adapter: "mock" },
        messaging: { enabled: true, adapter: "mock" },
        alarms: {
          enabled: true,
          adapter: "local",
          confirmationRequiredCapabilities: ["alarm.create"],
        },
      },
    });
  });

  it("loads an explicit config path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-config-"));
    const configPath = join(directory, "config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        assistant: {
          name: "Friday",
          wakePhrases: ["hey friday"],
        },
        intent: {
          provider: "deterministic",
        },
        features: {
          calendar: { enabled: false },
        },
      }),
    );

    await expect(loadConfig({ configPath })).resolves.toEqual({
      assistant: {
        name: "Friday",
        wakePhrases: ["hey friday"],
      },
      intent: {
        provider: "deterministic",
      },
      features: {
        calendar: { enabled: false },
      },
    });
  });

  it("loads checked-in streaming voice example configs", async () => {
    const desktopConfig = await loadConfig({
      configPath: "config/local-desktop-voice-openai.json",
    });
    const piConfig = await loadConfig({
      configPath: "config/pi-voice-openai.example.json",
    });

    for (const config of [desktopConfig, piConfig]) {
      expect(config.desktopVoice?.openAIRealtimeTranscription?.model).toBe(
        "gpt-realtime-whisper",
      );
      expect(config.desktopVoice?.streamingAudioInput?.args).toContain("24000");
      expect(config.voice?.streamingSpeechToText).toBe("openai-realtime");
      expect(config.voice?.wakeActivation).toBe("openwakeword-command");
    }
  });
});

describe("parseAssistantConfig", () => {
  it("rejects invalid config shape", () => {
    expect(() =>
      parseAssistantConfig({
        assistant: {
          name: "",
          wakePhrases: ["hey jarvis"],
        },
        intent: {
          provider: "deterministic",
        },
        features: {},
      }),
    ).toThrow("Config assistant.name must be a non-empty string.");
  });

  it("rejects invalid feature enablement", () => {
    expect(() =>
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        intent: {
          provider: "deterministic",
        },
        features: {
          calendar: { enabled: "yes" },
        },
      }),
    ).toThrow('Config feature "calendar".enabled must be a boolean.');
  });

  it("parses confirmation-required capabilities", () => {
    expect(
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        intent: {
          provider: "deterministic",
        },
        features: {
          alarms: {
            enabled: true,
            adapter: "local",
            confirmationRequiredCapabilities: ["alarm.create"],
          },
        },
      }),
    ).toEqual({
      assistant: {
        name: "Jarvis",
        wakePhrases: ["hey jarvis"],
      },
      intent: {
        provider: "deterministic",
      },
      features: {
        alarms: {
          enabled: true,
          adapter: "local",
          confirmationRequiredCapabilities: ["alarm.create"],
        },
      },
    });
  });

  it("parses OpenAI intent config with defaults", () => {
    expect(
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        intent: {
          provider: "openai",
          openai: {
            model: "gpt-5.5",
          },
        },
        features: {},
      }),
    ).toEqual({
      assistant: {
        name: "Jarvis",
        wakePhrases: ["hey jarvis"],
      },
      intent: {
        provider: "openai",
        openai: {
          apiKeyEnv: "OPENAI_API_KEY",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-5.5",
          timeoutMs: 30_000,
        },
      },
      features: {},
    });
  });

  it("parses OpenAI intent config overrides", () => {
    expect(
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        intent: {
          provider: "openai",
          openai: {
            apiKeyEnv: "PERSONAL_AI_OPENAI_API_KEY",
            baseUrl: "https://example.test/v1",
            model: "gpt-5.5",
            timeoutMs: 1000,
          },
        },
        features: {},
      }).intent.openai,
    ).toEqual({
      apiKeyEnv: "PERSONAL_AI_OPENAI_API_KEY",
      baseUrl: "https://example.test/v1",
      model: "gpt-5.5",
      timeoutMs: 1000,
    });
  });

  it("resolves deterministic intent config", () => {
    expect(
      requireIntentConfig(
        parseAssistantConfig({
          assistant: {
            name: "Jarvis",
            wakePhrases: ["hey jarvis"],
          },
          intent: {
            provider: "deterministic",
          },
          features: {},
        }),
      ),
    ).toEqual({ provider: "deterministic" });
  });

  it("resolves OpenAI intent config with provider settings", () => {
    expect(
      requireIntentConfig(
        parseAssistantConfig({
          assistant: {
            name: "Jarvis",
            wakePhrases: ["hey jarvis"],
          },
          intent: {
            provider: "openai",
            openai: {
              model: "gpt-5.5",
            },
          },
          features: {},
        }),
      ),
    ).toEqual({
      provider: "openai",
      openai: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5.5",
        timeoutMs: 30_000,
      },
    });
  });

  it("parses voice adapter IDs", () => {
    const voice = {
      input: "mock",
      wakeWord: "mock",
      wakeActivation: "openwakeword-command",
      streamingAudioInput: "sox-rec-stream",
      streamingAudioOutput: "sox-play-stream",
      streamingSpeechToText: "openai-realtime",
      streamingTextToSpeech: "openai-streaming",
      speechToText: "mock",
      textToSpeech: "mock",
      audioOutput: "mock",
    };

    expect(parseAssistantConfig(createMinimalConfig({ voice }))).toEqual(
      createMinimalConfig({ voice }),
    );
  });

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
        desktopVoice: {
          ...desktopVoice,
          openAIRealtimeTranscription: {
            apiKeyEnv: "OPENAI_API_KEY",
            baseUrl: "wss://api.openai.com/v1/realtime",
            model: "gpt-realtime-whisper",
            timeoutMs: 30_000,
          },
          openAIStreamingSpeech: {
            apiKeyEnv: "OPENAI_API_KEY",
            baseUrl: "https://api.openai.com/v1",
            instructions: "Speak clearly and concisely.",
            model: "gpt-4o-mini-tts",
            responseFormat: "pcm",
            voice: "coral",
          },
        },
      }),
    );
  });

  it("resolves selected desktop streaming adapter config into required bundles", () => {
    const config = parseAssistantConfig(
      createMinimalConfig({
        desktopVoice: {
          audioInput: { command: "fake-rec" },
          audioOutput: { command: "fake-play" },
          openAIRealtimeTranscription: {
            model: "gpt-realtime-whisper",
          },
          openAIStreamingSpeech: {
            model: "gpt-4o-mini-tts",
            voice: "coral",
          },
          speechToText: { command: "fake-stt" },
          streamingAudioInput: { command: "fake-stream-rec" },
          streamingAudioOutput: { command: "fake-stream-play" },
          textToSpeech: { command: "fake-tts" },
          wakeActivation: { command: "fake-wake" },
        },
        voice: {
          audioOutput: "sox-play",
          input: "sox-rec",
          speechToText: "command",
          streamingAudioInput: "sox-rec-stream",
          streamingAudioOutput: "sox-play-stream",
          streamingSpeechToText: "openai-realtime",
          streamingTextToSpeech: "openai-streaming",
          textToSpeech: "command",
          wakeActivation: "openwakeword-command",
          wakeWord: "text-prefix",
        },
      }),
    );

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
    const config = parseAssistantConfig(
      createMinimalConfig({
        desktopVoice: {
          audioInput: { command: "fake-rec" },
          audioOutput: { command: "fake-play" },
          speechToText: { command: "fake-stt" },
          streamingAudioInput: { command: "fake-stream-rec" },
          textToSpeech: { command: "fake-tts" },
        },
        voice: {
          audioOutput: "sox-play",
          input: "sox-rec",
          speechToText: "command",
          streamingAudioInput: "sox-rec-stream",
          streamingSpeechToText: "openai-realtime",
          textToSpeech: "command",
          wakeWord: "text-prefix",
        },
      }),
    );

    expect(() =>
      resolveDesktopVoiceAdapterConfig(requireVoiceConfig(config), config),
    ).toThrow(
      "Config desktopVoice.openAIRealtimeTranscription must be configured.",
    );
  });

  it("rejects unknown selected desktop streaming adapters before provider config requirements", () => {
    const config = parseAssistantConfig(
      createMinimalConfig({
        desktopVoice: {
          audioInput: { command: "fake-rec" },
          audioOutput: { command: "fake-play" },
          speechToText: { command: "fake-stt" },
          streamingAudioInput: { command: "fake-stream-rec" },
          textToSpeech: { command: "fake-tts" },
        },
        voice: {
          audioOutput: "sox-play",
          input: "sox-rec",
          speechToText: "command",
          streamingAudioInput: "sox-rec-stream",
          streamingSpeechToText: "unknown",
          textToSpeech: "command",
          wakeWord: "text-prefix",
        },
      }),
    );

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

  it("rejects invalid desktop voice command config", () => {
    expect(() =>
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        desktopVoice: {
          speechToText: {
            command: "",
          },
        },
        intent: {
          provider: "deterministic",
        },
        features: {},
      }),
    ).toThrow(
      "Config desktopVoice.speechToText.command must be a non-empty string.",
    );
  });

  it("rejects invalid desktop voice command args", () => {
    expect(() =>
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        desktopVoice: {
          textToSpeech: {
            command: "fake-tts",
            args: ["--text", 1],
          },
        },
        intent: {
          provider: "deterministic",
        },
        features: {},
      }),
    ).toThrow("Config desktopVoice.textToSpeech.args must be a string array.");
  });

  it("rejects invalid OpenAI realtime transcription timeout", () => {
    expect(() =>
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        desktopVoice: {
          openAIRealtimeTranscription: {
            model: "gpt-realtime-whisper",
            timeoutMs: 0,
          },
        },
        intent: {
          provider: "deterministic",
        },
        features: {},
      }),
    ).toThrow(
      "Config desktopVoice.openAIRealtimeTranscription.timeoutMs must be a positive integer.",
    );
  });

  it("rejects non-realtime models for OpenAI realtime transcription", () => {
    expect(() =>
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        desktopVoice: {
          openAIRealtimeTranscription: {
            model: "gpt-4o-transcribe",
          },
        },
        intent: {
          provider: "deterministic",
        },
        features: {},
      }),
    ).toThrow(
      "Config desktopVoice.openAIRealtimeTranscription.model must be gpt-realtime-whisper.",
    );
  });

  it("rejects invalid voice adapter IDs", () => {
    expect(() =>
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        intent: {
          provider: "deterministic",
        },
        voice: {
          speechToText: "",
        },
        features: {},
      }),
    ).toThrow("Config voice.speechToText must be a non-empty string.");
  });

  it("rejects invalid confirmation-required capabilities", () => {
    expect(() =>
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        intent: {
          provider: "deterministic",
        },
        features: {
          alarms: {
            enabled: true,
            confirmationRequiredCapabilities: [1],
          },
        },
      }),
    ).toThrow(
      'Config feature "alarms".confirmationRequiredCapabilities must be a string array.',
    );
  });

  it("rejects missing intent provider config", () => {
    expect(() =>
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        features: {},
      }),
    ).toThrow("Config intent section must be a JSON object.");
  });

  it("parses OpenAI intent provider without provider settings", () => {
    expect(
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        intent: {
          provider: "openai",
        },
        features: {},
      }),
    ).toMatchObject({
      intent: {
        provider: "openai",
      },
    });
  });

  it("rejects OpenAI intent provider without provider settings during resolution", () => {
    expect(() =>
      requireIntentConfig(
        parseAssistantConfig({
          assistant: {
            name: "Jarvis",
            wakePhrases: ["hey jarvis"],
          },
          intent: {
            provider: "openai",
          },
          features: {},
        }),
      ),
    ).toThrow("Config intent.openai must be configured.");
  });

  it("rejects invalid OpenAI intent model", () => {
    expect(() =>
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        intent: {
          provider: "openai",
          openai: {
            model: "",
          },
        },
        features: {},
      }),
    ).toThrow("Config intent.openai.model must be a non-empty string.");
  });

  it("rejects invalid OpenAI intent API key env", () => {
    expect(() =>
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        intent: {
          provider: "openai",
          openai: {
            apiKeyEnv: "",
            model: "gpt-5.5",
          },
        },
        features: {},
      }),
    ).toThrow("Config intent.openai.apiKeyEnv must be a non-empty string.");
  });

  it("rejects invalid OpenAI intent timeout", () => {
    expect(() =>
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        intent: {
          provider: "openai",
          openai: {
            model: "gpt-5.5",
            timeoutMs: 0,
          },
        },
        features: {},
      }),
    ).toThrow("Config intent.openai.timeoutMs must be a positive integer.");
  });

  it("rejects invalid feature adapter IDs", () => {
    expect(() =>
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        intent: {
          provider: "deterministic",
        },
        features: {
          calendar: { enabled: true, adapter: "" },
        },
      }),
    ).toThrow('Config feature "calendar".adapter must be a non-empty string.');
  });

  it("keeps selected feature adapter provider config out of the common feature shape", () => {
    const feature = parseAssistantConfig(
      createMinimalConfig({
        features: {
          calendar: {
            enabled: true,
            adapter: "google",
            google: {},
          },
        },
      }),
    ).features.calendar;

    expect(feature).toEqual({
      enabled: true,
      adapter: "google",
    });
  });

  it("defers selected feature adapter provider config validation", () => {
    expect(
      parseAssistantConfig(
        createMinimalConfig({
          features: {
            calendar: {
              enabled: true,
              adapter: "google",
              google: {
                timeoutMs: 0,
              },
            },
          },
        }),
      ),
    ).toEqual({
      assistant: {
        name: "Jarvis",
        wakePhrases: ["hey jarvis"],
      },
      features: {
        calendar: {
          adapter: "google",
          enabled: true,
        },
      },
      intent: {
        provider: "deterministic",
      },
    });
  });

  it("ignores unselected feature adapter provider config", () => {
    const feature = parseAssistantConfig(
      createMinimalConfig({
        features: {
          calendar: {
            enabled: true,
            adapter: "mock",
            google: {
              timeoutMs: 0,
            },
          },
        },
      }),
    ).features.calendar;

    expect(feature).toEqual({
      enabled: true,
      adapter: "mock",
    });
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

describe("runtime config resolvers", () => {
  it("resolves required voice adapter IDs for voice runtimes", () => {
    expect(
      requireVoiceConfig(
        parseAssistantConfig({
          assistant: {
            name: "Jarvis",
            wakePhrases: ["hey jarvis"],
          },
          intent: {
            provider: "deterministic",
          },
          voice: {
            input: "mock",
            wakeWord: "mock",
            speechToText: "mock",
            textToSpeech: "mock",
            audioOutput: "mock",
          },
          features: {},
        }),
      ),
    ).toEqual({
      input: "mock",
      wakeWord: "mock",
      speechToText: "mock",
      textToSpeech: "mock",
      audioOutput: "mock",
    });
  });

  it("rejects missing required voice adapter IDs", () => {
    expect(() =>
      requireVoiceConfig(
        parseAssistantConfig({
          assistant: {
            name: "Jarvis",
            wakePhrases: ["hey jarvis"],
          },
          intent: {
            provider: "deterministic",
          },
          voice: {
            input: "mock",
          },
          features: {},
        }),
      ),
    ).toThrow("Config voice.wakeWord must be configured.");
  });

  it("resolves required desktop voice command settings", () => {
    const command = {
      command: "fake-command",
      args: ["{input}"],
      timeoutMs: 2000,
    };

    expect(
      requireDesktopVoiceConfig(
        parseAssistantConfig({
          assistant: {
            name: "Jarvis",
            wakePhrases: ["hey jarvis"],
          },
          desktopVoice: {
            audioInput: command,
            audioOutput: command,
            speechToText: command,
            textToSpeech: command,
          },
          intent: {
            provider: "deterministic",
          },
          features: {},
        }),
      ),
    ).toEqual({
      audioInput: command,
      audioOutput: command,
      speechToText: command,
      textToSpeech: command,
    });
  });

  it("rejects missing required desktop voice command settings", () => {
    expect(() =>
      requireDesktopVoiceConfig(
        parseAssistantConfig({
          assistant: {
            name: "Jarvis",
            wakePhrases: ["hey jarvis"],
          },
          desktopVoice: {
            audioInput: {
              command: "fake-rec",
            },
          },
          intent: {
            provider: "deterministic",
          },
          features: {},
        }),
      ),
    ).toThrow("Config desktopVoice.audioOutput must be configured.");
  });
});
