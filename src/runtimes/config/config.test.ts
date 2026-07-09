import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, parseAssistantConfig } from "./config.js";
import { requireIntentConfig } from "./intent-config.js";
import { requireVoiceConfig } from "./voice-config.js";

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
      conversation: {
        history: {
          maxTurnsBeforeCompaction: 5,
        },
        provider: "disabled",
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
      conversation: {
        history: {
          maxTurnsBeforeCompaction: 5,
        },
        provider: "disabled",
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
      expect(config.desktopVoice?.openAIRealtimeTranscription).toMatchObject({
        model: "gpt-realtime-whisper",
      });
      expect(config.desktopVoice?.streamingAudioInput?.args).toContain("24000");
      expect(config.voice?.streamingSpeechToText).toBe("openai-realtime");
      expect(config.voice?.wakeActivation).toBe("openwakeword-command");
    }
  });

  it("ends desktop OpenAI command capture on trailing silence", async () => {
    const config = await loadConfig({
      configPath: "config/local-desktop-voice-openai.json",
    });

    expect(config.desktopVoice?.streamingAudioInput?.args?.slice(-10)).toEqual([
      "trim",
      "0",
      "8",
      "silence",
      "1",
      "0.1",
      "1%",
      "1",
      "0.8",
      "1%",
    ]);
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
      conversation: {
        history: {
          maxTurnsBeforeCompaction: 5,
        },
        provider: "disabled",
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

    expect(parseAssistantConfig(createMinimalConfig({ voice }))).toEqual({
      ...createMinimalConfig({ voice }),
      conversation: {
        history: {
          maxTurnsBeforeCompaction: 5,
        },
        provider: "disabled",
      },
    });
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
        conversation: {
          history: {
            maxTurnsBeforeCompaction: 5,
          },
          provider: "disabled",
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

  it("parses selected feature adapter provider config into the feature shape", () => {
    const config = parseAssistantConfig(
      createMinimalConfig({
        features: {
          calendar: {
            enabled: true,
            adapter: "google",
            google: {},
          },
        },
      }),
    );

    expect(config.features.calendar).toEqual({
      enabled: true,
      adapter: "google",
      google: {
        accessTokenEnv: "GOOGLE_CALENDAR_ACCESS_TOKEN",
        baseUrl: "https://www.googleapis.com/calendar/v3",
        calendarId: "primary",
        maxResults: 10,
        timeoutMs: 30_000,
      },
    });
  });

  it("validates selected feature adapter provider config during parsing", () => {
    expect(() =>
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
    ).toThrow(
      'Config feature "calendar".google.timeoutMs must be a positive integer.',
    );
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
});
