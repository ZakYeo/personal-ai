import { createCapturedWriter, line } from "../../test-support/primitives.js";
import type { AssistantResponse } from "../../ports/assistant.js";
import {
  logAssistantResponse,
  logCommandTranscript,
  logVoiceProgress,
  logWakeDetected,
  logWakeListening,
} from "./voice-progress.js";

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

  it("owns wake listening progress message formatting", () => {
    const progressOutput = createCapturedWriter();

    logWakeListening({ progressOutput }, ["hey jarvis", "computer"]);

    expect(progressOutput.writes).toEqual([
      line('Now listening for wake word "hey jarvis" or "computer".'),
    ]);
  });

  it("owns voice command progress message formatting", () => {
    const progressOutput = createCapturedWriter();
    const response: AssistantResponse = {
      status: "ok",
      text: "There are no alarms set.",
    };

    logWakeDetected({ progressOutput });
    logCommandTranscript({ progressOutput }, "Hey Jarvis, list my alarms");
    logAssistantResponse({ progressOutput }, response);

    expect(progressOutput.writes).toEqual([
      line("Wake word detected, now listening..."),
      line("Heard: Hey Jarvis, list my alarms"),
      line("Assistant: There are no alarms set."),
    ]);
  });
});
