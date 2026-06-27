import { detectTextWakePhrase } from "./text-wake-phrase.js";

describe("detectTextWakePhrase", () => {
  it("matches configured wake phrases by normalized text prefix", () => {
    expect(
      detectTextWakePhrase({
        audio: { text: "  HEY   Jarvis, list alarms" },
        wakePhrases: ["hey jarvis"],
      }),
    ).toEqual({
      detected: true,
      phrase: "hey jarvis",
    });
  });

  it("does not match wake phrases outside the text prefix", () => {
    expect(
      detectTextWakePhrase({
        audio: { text: "list alarms hey jarvis" },
        wakePhrases: ["hey jarvis"],
      }),
    ).toEqual({ detected: false });
  });
});
