import {
  createCapturedWriter,
  createThrowingAssistant,
  createVoiceRuntimeDependencies,
  deterministicVoiceUtterance,
} from "./voice-runtime.js";
import {
  deterministicScenarios,
  voiceEnabledDeterministicConfig,
} from "./deterministic-scenarios.js";

describe("voice runtime test support", () => {
  it("creates deterministic voice dependencies at the runtime boundary", async () => {
    const dependencies = createVoiceRuntimeDependencies();

    await expect(dependencies.audioInput.capture()).resolves.toEqual({
      text: deterministicVoiceUtterance,
    });
    await expect(
      dependencies.wakeWord.detect({
        audio: { text: deterministicVoiceUtterance },
        wakePhrases: voiceEnabledDeterministicConfig.assistant.wakePhrases,
      }),
    ).resolves.toEqual({ detected: true, phrase: "hey jarvis" });
    await expect(
      dependencies.assistant.handleTextWithDiagnostics(
        deterministicScenarios.alarmListEmpty.text,
      ),
    ).resolves.toEqual({
      response: deterministicScenarios.alarmListEmpty.response,
    });
  });

  it("captures writes and supports throwing assistant fixtures", async () => {
    const writer = createCapturedWriter();
    const assistant = createThrowingAssistant("fixture failure");

    writer.write("hello\n");

    expect(writer.writes).toEqual(["hello\n"]);
    await expect(assistant.handleText("anything")).rejects.toThrow(
      "fixture failure",
    );
    await expect(
      assistant.handleTextWithDiagnostics("anything"),
    ).rejects.toThrow("fixture failure");
  });
});
