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
      features: {
        calendar: { enabled: true },
        messaging: { enabled: true },
        alarms: {
          enabled: true,
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
        features: {
          alarms: {
            enabled: true,
            confirmationRequiredCapabilities: ["alarm.create"],
          },
        },
      }),
    ).toEqual({
      assistant: {
        name: "Jarvis",
        wakePhrases: ["hey jarvis"],
      },
      features: {
        alarms: {
          enabled: true,
          confirmationRequiredCapabilities: ["alarm.create"],
        },
      },
    });
  });

  it("rejects invalid confirmation-required capabilities", () => {
    expect(() =>
      parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
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
});
