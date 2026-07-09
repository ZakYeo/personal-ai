import { loadConfig } from "../runtimes/config/config.js";
import { createFileFedDesktopVoiceOpenAISmokeConfig } from "./desktop-voice-openai-smoke.js";

describe("desktop voice OpenAI smoke support", () => {
  it("feeds command fixtures through the same silence-ending SoX chain as local capture", async () => {
    const config = createFileFedDesktopVoiceOpenAISmokeConfig(
      await loadConfig({
        configPath: "config/local-desktop-voice-openai.json",
      }),
      {
        commandPcm: "test/fixtures/audio/list-my-alarms-24khz-mono-s16le.pcm",
        wakeWav: "test/fixtures/audio/hey-jarvis.wav",
      },
    );

    const streamingAudioInput = config.desktopVoice?.streamingAudioInput;

    expect(streamingAudioInput?.command).toBe("sox");
    expect(streamingAudioInput?.args?.slice(-10)).toEqual([
      "trim",
      "0",
      "8",
      "silence",
      "1",
      "0.1",
      "1%",
      "1",
      "0.8",
      "1%",
    ]);
  });
});
