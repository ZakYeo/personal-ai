import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, parseAssistantConfig } from "./config.js";

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

  it("parses voice adapter IDs", () => {
    expect(
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
    ).toEqual({
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
    });
  });

  it("parses desktop voice command config", () => {
    expect(
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        desktopVoice: {
          speechToText: {
            command: "fake-stt",
            args: ["--input", "{input}"],
            timeoutMs: 2000,
          },
          textToSpeech: {
            command: "fake-tts",
            args: ["--text", "{text}", "--output", "{output}"],
          },
        },
        intent: {
          provider: "deterministic",
        },
        features: {},
      }),
    ).toEqual({
      assistant: {
        name: "Jarvis",
        wakePhrases: ["hey jarvis"],
      },
      desktopVoice: {
        speechToText: {
          command: "fake-stt",
          args: ["--input", "{input}"],
          timeoutMs: 2000,
        },
        textToSpeech: {
          command: "fake-tts",
          args: ["--text", "{text}", "--output", "{output}"],
        },
      },
      intent: {
        provider: "deterministic",
      },
      features: {},
    });
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
});
