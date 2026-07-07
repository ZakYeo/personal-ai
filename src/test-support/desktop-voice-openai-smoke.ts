import type { LoadedRuntimeConfig } from "../runtimes/config/config.js";

interface DesktopVoiceOpenAISmokeFixturePaths {
  commandPcm: string;
  wakeWav: string;
}

export function createFileFedDesktopVoiceOpenAISmokeConfig(
  config: LoadedRuntimeConfig,
  fixtures: DesktopVoiceOpenAISmokeFixturePaths,
): LoadedRuntimeConfig {
  const wakeActivation = config.desktopVoice?.wakeActivation;

  if (!wakeActivation) {
    throw new Error(
      "Desktop voice OpenAI smoke config requires desktopVoice.wakeActivation.",
    );
  }

  return {
    ...config,
    desktopVoice: {
      ...config.desktopVoice,
      streamingAudioInput: {
        args: [fixtures.commandPcm],
        command: "cat",
        timeoutMs: 45_000,
      },
      streamingAudioOutput: {
        command: "cat",
        timeoutMs: 30_000,
      },
      wakeActivation: {
        ...wakeActivation,
        args: [
          "scripts/openwakeword-listener.py",
          "--model",
          "hey jarvis",
          "--threshold",
          "0.5",
          "--rec-command",
          createOpenWakeWordFixtureRecCommand(fixtures.wakeWav),
        ],
        timeoutMs: 30_000,
      },
    },
  };
}

function createOpenWakeWordFixtureRecCommand(wakeWavPath: string): string {
  return [
    "sox",
    quoteCommandArgument(wakeWavPath),
    "-r",
    "16000",
    "-c",
    "1",
    "-b",
    "16",
    "-e",
    "signed-integer",
    "-t",
    "raw",
    "-",
  ].join(" ");
}

function quoteCommandArgument(value: string): string {
  if (/^[\w./:-]+$/u.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}
