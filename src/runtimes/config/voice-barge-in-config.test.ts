import { parseVoiceConfig, requireVoiceConfig } from "./voice-config.js";

describe("voice barge-in configuration", () => {
  it.each(["headphones", "echo_cancelled"])(
    "requires explicit %s input isolation before enabling capture during playback",
    (inputIsolation) => {
      const parsed = parseVoiceConfig({
        input: "mock",
        speechToText: "mock",
        textToSpeech: "mock",
        audioOutput: "mock",
        wakeWord: "mock",
        bargeIn: { enabled: true, inputIsolation },
      });
      expect(requireVoiceConfig(parsed).bargeIn).toEqual({ inputIsolation });
    },
  );

  it.each([undefined, { enabled: false }])(
    "keeps capture during playback disabled for %j",
    (bargeIn) => {
      expect(parseVoiceConfig({ bargeIn }).voice).not.toHaveProperty("bargeIn");
    },
  );

  it.each([
    true,
    {},
    { enabled: "yes" },
    { enabled: true },
    { enabled: true, inputIsolation: "automatic" },
  ])("rejects an unproven capture configuration: %j", (bargeIn) => {
    expect(() => parseVoiceConfig({ bargeIn })).toThrow(/bargeIn/u);
  });
});
