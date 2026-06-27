import { selectConfiguredVoiceAdapter } from "./voice-adapter-selection.js";
import type { ResolvedVoiceConfig } from "../config/voice-config.js";

const voiceConfig: ResolvedVoiceConfig = {
  input: "mock",
  wakeWord: "mock",
  speechToText: "mock",
  textToSpeech: "mock",
  audioOutput: "mock",
};

describe("selectConfiguredVoiceAdapter", () => {
  it("selects registered voice adapters by configured ID", () => {
    const createAdapter = selectConfiguredVoiceAdapter(voiceConfig, "input", {
      mock: (value: string) => `adapter:${value}`,
    });

    expect(createAdapter("utterance")).toBe("adapter:utterance");
  });

  it("rejects unregistered voice adapter IDs", () => {
    expect(() =>
      selectConfiguredVoiceAdapter(
        {
          ...voiceConfig,
          speechToText: "unknown",
        },
        "speechToText",
        {
          mock: () => "adapter",
        },
      ),
    ).toThrow('Config voice.speechToText "unknown" is not registered.');
  });
});
