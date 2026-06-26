import { selectConfiguredVoiceAdapter } from "./voice-adapter-selection.js";
import type { AssistantConfig } from "../../ports/assistant.js";

const baseConfig: AssistantConfig = {
  assistant: {
    name: "Jarvis",
    wakePhrases: ["hey jarvis"],
  },
  features: {},
  intent: {
    provider: "deterministic",
  },
};

describe("selectConfiguredVoiceAdapter", () => {
  it("selects registered voice adapters by configured ID", () => {
    const createAdapter = selectConfiguredVoiceAdapter(
      {
        ...baseConfig,
        voice: {
          input: "mock",
        },
      },
      "input",
      {
        mock: (value: string) => `adapter:${value}`,
      },
    );

    expect(createAdapter("utterance")).toBe("adapter:utterance");
  });

  it("rejects missing voice adapter IDs", () => {
    expect(() =>
      selectConfiguredVoiceAdapter(baseConfig, "speechToText", {
        mock: () => "adapter",
      }),
    ).toThrow("Config voice.speechToText must be configured.");
  });

  it("rejects unregistered voice adapter IDs", () => {
    expect(() =>
      selectConfiguredVoiceAdapter(
        {
          ...baseConfig,
          voice: {
            speechToText: "unknown",
          },
        },
        "speechToText",
        {
          mock: () => "adapter",
        },
      ),
    ).toThrow('Config voice.speechToText "unknown" is not registered.');
  });
});
