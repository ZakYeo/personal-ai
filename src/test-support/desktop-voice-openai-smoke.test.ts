import { readFile } from "node:fs/promises";

import { loadConfig } from "../runtimes/config/config.js";
import { createFileFedDesktopVoiceOpenAISmokeConfig } from "./desktop-voice-openai-smoke.js";

describe("desktop voice OpenAI smoke support", () => {
  it("feeds command fixtures through the same silence-ending SoX chain as local capture", async () => {
    const localConfig = await loadConfig({
      configPath: "config/local-desktop-voice-openai.json",
    });
    const config = createFileFedDesktopVoiceOpenAISmokeConfig(localConfig, {
      commandPcm: "test/fixtures/audio/list-my-alarms-24khz-mono-s16le.pcm",
      wakeWav: "test/fixtures/audio/hey-jarvis.wav",
    });

    const streamingAudioInput = config.desktopVoice?.streamingAudioInput;
    const configuredEffects = commandCaptureEffects(localConfig);

    expect(streamingAudioInput?.command).toBe("sox");
    expect(streamingAudioInput?.args?.slice(-configuredEffects.length)).toEqual(
      configuredEffects,
    );
    expect(config.features.calendar).toEqual({
      adapter: "google",
      enabled: false,
    });
  });

  it.each([
    ["desktop", "config/local-desktop-voice-openai.json", true],
    ["Pi", "config/pi-voice-openai.example.json", false],
  ])(
    "pins every active OpenAI Responses workload in the %s config to Luna with Nano-compatible reasoning",
    async (_name, configPath, hasResponseRewriter) => {
      const rawConfig: unknown = JSON.parse(await readFile(configPath, "utf8"));

      expect(rawConfig).toMatchObject({
        conversation: {
          openai: {
            model: "gpt-5.6-luna",
            reasoningEffort: "none",
          },
        },
        features: {
          internetSearch: {
            openai: {
              model: "gpt-5.6-luna",
              reasoningEffort: "none",
            },
          },
        },
        intent: {
          openai: {
            model: "gpt-5.6-luna",
            reasoningEffort: "none",
          },
        },
        ...(hasResponseRewriter
          ? {
              responseRewriter: {
                openai: {
                  model: "gpt-5.6-luna",
                  reasoningEffort: "none",
                },
              },
            }
          : {}),
      });
    },
  );
});

function commandCaptureEffects(
  config: Awaited<ReturnType<typeof loadConfig>>,
): string[] {
  const args = config.desktopVoice?.streamingAudioInput?.args;
  const outputIndex = args?.indexOf("-");

  if (!args || outputIndex === undefined || outputIndex < 0) {
    throw new Error("Expected local config streaming audio output args.");
  }

  return args.slice(outputIndex + 1);
}
