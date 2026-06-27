import {
  detectWakePhrase,
  normalizeSpokenText,
  stripWakePhrase,
} from "./spoken-text.js";

describe("spoken text helpers", () => {
  it("normalizes case, spacing, and surrounding punctuation", () => {
    expect(normalizeSpokenText("  Hey   Jarvis, LIST alarms! ")).toBe(
      "hey jarvis, list alarms",
    );
  });

  it("detects configured wake phrases by normalized text prefix", () => {
    expect(
      detectWakePhrase("  HEY   Jarvis, list alarms", ["hey jarvis"]),
    ).toEqual({
      detected: true,
      phrase: "hey jarvis",
      strippedText: "list alarms",
    });
  });

  it("does not detect wake phrases outside the text prefix", () => {
    expect(detectWakePhrase("list alarms hey jarvis", ["hey jarvis"])).toEqual({
      detected: false,
      strippedText: "list alarms hey jarvis",
    });
  });

  it("strips matching wake phrases from normalized command text", () => {
    expect(stripWakePhrase("  Hey Jarvis,   LIST my alarms! ")).toBe(
      "list my alarms",
    );
  });
});
