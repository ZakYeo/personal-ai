import { createCapturedWriter, line } from "../../test-support/primitives.js";
import { formatWakePhraseList, logVoiceProgress } from "./voice-progress.js";

describe("voice progress logging", () => {
  it("writes newline-terminated progress messages when a writer is configured", () => {
    const progressOutput = createCapturedWriter();

    logVoiceProgress(
      { progressOutput },
      "Wake word detected, now listening...",
    );

    expect(progressOutput.writes).toEqual([
      line("Wake word detected, now listening..."),
    ]);
  });

  it("does nothing when no progress writer is configured", () => {
    expect(() => {
      logVoiceProgress({}, "Wake word detected, now listening...");
    }).not.toThrow();
  });

  it("formats configured wake phrases for human-readable progress output", () => {
    expect(formatWakePhraseList(["hey jarvis"])).toBe('"hey jarvis"');
    expect(formatWakePhraseList(["hey jarvis", "computer"])).toBe(
      '"hey jarvis" or "computer"',
    );
  });
});
