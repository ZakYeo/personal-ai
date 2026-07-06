import {
  createDesktopVoiceCommand,
  createDesktopVoiceConfig,
  withDesktopSpeechToTextFailure,
  withoutDesktopAudioInput,
  withoutDesktopSpeechToText,
  withoutDesktopWakeAudioInput,
} from "./desktop-voice-runtime.js";
import { deterministicScenarios } from "./deterministic-scenarios.js";

describe("desktop voice runtime test support", () => {
  it("creates deterministic desktop voice config with command adapters", () => {
    const config = createDesktopVoiceConfig(
      deterministicScenarios.alarmListEmpty.text,
    );

    expect(config.voice).toEqual({
      audioOutput: "sox-play",
      input: "sox-rec",
      speechToText: "command",
      textToSpeech: "command",
      wakeWord: "text-prefix",
    });
    expect(config.desktopVoice?.speechToText).toEqual(
      createDesktopVoiceCommand(
        `printf '%s' ${JSON.stringify(
          deterministicScenarios.alarmListEmpty.text,
        )}`,
      ),
    );
  });

  it("creates focused desktop voice config variants", () => {
    const config = createDesktopVoiceConfig(
      deterministicScenarios.alarmListEmpty.text,
    );

    expect(withoutDesktopSpeechToText(config).desktopVoice).not.toHaveProperty(
      "speechToText",
    );
    expect(withoutDesktopAudioInput(config).desktopVoice).not.toHaveProperty(
      "audioInput",
    );
    expect(
      withoutDesktopWakeAudioInput(config).desktopVoice,
    ).not.toHaveProperty("wakeAudioInput");
    expect(
      withDesktopSpeechToTextFailure(config, "stt provider token failure", 12)
        .desktopVoice?.speechToText,
    ).toEqual(
      createDesktopVoiceCommand(
        `printf '%s' ${JSON.stringify("stt provider token failure")} >&2; exit 12`,
      ),
    );
  });
});
