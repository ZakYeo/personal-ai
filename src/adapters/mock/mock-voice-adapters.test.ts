import {
  MockAudioInput,
  MockAudioOutput,
  MockSpeechToText,
  MockTextToSpeech,
  MockWakeWordDetector,
} from "./mock-voice-adapters.js";

describe("mock voice adapters", () => {
  it("captures a configured utterance", async () => {
    const input = new MockAudioInput("Hey Jarvis, list my alarms");

    await expect(input.capture()).resolves.toEqual({
      text: "Hey Jarvis, list my alarms",
    });
  });

  it("detects configured wake phrases case-insensitively", async () => {
    const detector = new MockWakeWordDetector();

    await expect(
      detector.detect({
        audio: { text: "HEY JARVIS, list my alarms" },
        wakePhrases: ["hey jarvis"],
      }),
    ).resolves.toEqual({ detected: true, phrase: "hey jarvis" });
  });

  it("does not detect missing wake phrases", async () => {
    const detector = new MockWakeWordDetector();

    await expect(
      detector.detect({
        audio: { text: "list my alarms" },
        wakePhrases: ["hey jarvis"],
      }),
    ).resolves.toEqual({ detected: false });
  });

  it("transcribes captured audio deterministically", async () => {
    const speechToText = new MockSpeechToText();

    await expect(
      speechToText.transcribe({ text: "Hey Jarvis, list my alarms" }),
    ).resolves.toEqual({ text: "Hey Jarvis, list my alarms" });
  });

  it("synthesizes response text deterministically", async () => {
    const textToSpeech = new MockTextToSpeech();

    await expect(
      textToSpeech.synthesize("There are no alarms set."),
    ).resolves.toEqual({ text: "There are no alarms set." });
  });

  it("records spoken output without writing text output", async () => {
    const output = new MockAudioOutput();

    await output.play({ text: "There are no alarms set." });

    expect(output.played).toEqual([{ text: "There are no alarms set." }]);
  });
});
