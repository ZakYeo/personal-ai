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
        args: createCommandFixtureStreamArgs(config, fixtures.commandPcm),
        command: "sox",
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

function createCommandFixtureStreamArgs(
  config: LoadedRuntimeConfig,
  commandPcmPath: string,
): string[] {
  const effects = commandCaptureEffects(config);

  return [
    "-r",
    "24000",
    "-c",
    "1",
    "-b",
    "16",
    "-e",
    "signed-integer",
    "-t",
    "raw",
    commandPcmPath,
    "-r",
    "24000",
    "-c",
    "1",
    "-b",
    "16",
    "-e",
    "signed-integer",
    "-t",
    "raw",
    "-",
    ...effects,
  ];
}

function commandCaptureEffects(config: LoadedRuntimeConfig): string[] {
  const args = config.desktopVoice?.streamingAudioInput?.args;
  const outputIndex = args?.indexOf("-");

  if (!args || outputIndex === undefined || outputIndex < 0) {
    throw new Error(
      "Desktop voice OpenAI smoke config requires streamingAudioInput output args.",
    );
  }

  return args.slice(outputIndex + 1);
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
