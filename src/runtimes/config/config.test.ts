import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, parseAssistantConfig } from "./config.js";
import { requireDesktopVoiceConfig } from "./desktop-voice-config.js";
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
      createMinimalConfig({ desktopVoice }),
    );
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

  it("parses Google calendar config with defaults", () => {
    expect(
      parseAssistantConfig(
        createMinimalConfig({
          features: {
            calendar: {
              enabled: true,
              adapter: "google",
              google: {},
            },
          },
        }),
      ).features.calendar,
    ).toEqual({
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

  it("parses Google calendar config overrides", () => {
    expect(
      parseAssistantConfig(
        createMinimalConfig({
          features: {
            calendar: {
              enabled: true,
              adapter: "google",
              google: {
                accessTokenEnv: "PERSONAL_AI_GOOGLE_CALENDAR_TOKEN",
                baseUrl: "https://calendar.example.test/v3",
                calendarId: "calendar@example.test",
                maxResults: 5,
                timeoutMs: 1000,
              },
            },
          },
        }),
      ).features.calendar?.google,
    ).toEqual({
      accessTokenEnv: "PERSONAL_AI_GOOGLE_CALENDAR_TOKEN",
      baseUrl: "https://calendar.example.test/v3",
      calendarId: "calendar@example.test",
      maxResults: 5,
      timeoutMs: 1000,
    });
  });

  it("rejects invalid Google calendar config", () => {
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
