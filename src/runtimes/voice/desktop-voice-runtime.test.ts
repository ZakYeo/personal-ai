import { createDesktopVoiceRuntime } from "./desktop-voice-runtime.js";
import {
  createDesktopVoiceConfig,
  withoutDesktopSpeechToText,
} from "../../test-support/desktop-voice-runtime.js";
import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";

describe("desktop voice runtime", () => {
  it("runs one configured desktop voice turn through the assistant core", async () => {
    const runtime = await createDesktopVoiceRuntime({
      config: createDesktopVoiceConfig(
        deterministicScenarios.alarmListEmpty.text,
      ),
    });

    await expect(runtime.runOnce()).resolves.toEqual({
      response: deterministicScenarios.alarmListEmpty.response,
      spokenText: deterministicScenarios.alarmListEmpty.response.text,
      status: "spoken",
      textOutputWritten: false,
      transcript: deterministicScenarios.alarmListEmpty.text,
      wakePhrase: "hey jarvis",
    });
  });

  it("rejects missing desktop voice command settings during composition", async () => {
    const config = withoutDesktopSpeechToText(
      createDesktopVoiceConfig(deterministicScenarios.alarmListEmpty.text),
    );

    await expect(createDesktopVoiceRuntime({ config })).rejects.toThrow(
      "Config desktopVoice.speechToText must be configured.",
    );
  });

  it("rejects unregistered desktop voice adapter IDs during composition", async () => {
    await expect(
      createDesktopVoiceRuntime({
        config: {
          ...createDesktopVoiceConfig(
            deterministicScenarios.alarmListEmpty.text,
          ),
          voice: {
            input: "sox-rec",
            wakeWord: "text-prefix",
            speechToText: "unknown",
            textToSpeech: "command",
            audioOutput: "sox-play",
          },
        },
      }),
    ).rejects.toThrow('Config voice.speechToText "unknown" is not registered.');
  });
});
