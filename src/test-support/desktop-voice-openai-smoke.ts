import type { LoadedRuntimeConfig } from "../runtimes/config/config.js";
import type { DesktopCommandConfig } from "../adapters/desktop/desktop-command-config.js";

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

  const calendar = config.features.calendar;

  return {
    ...config,
    desktopVoice: {
      ...config.desktopVoice,
      streamingAudioInput: createFileFedCommandStreamConfig(
        config,
        fixtures.commandPcm,
      ),
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
    features: {
      ...config.features,
      ...(calendar ? { calendar: disableFeature(calendar) } : {}),
    },
  };
}

export function createFileFedCommandStreamConfig(
  config: LoadedRuntimeConfig,
  commandAudioPath: string,
): DesktopCommandConfig {
  return {
    args: createCommandFixtureStreamArgs(config, commandAudioPath),
    command: "sox",
    timeoutMs: 45_000,
  };
}

function disableFeature(
  feature: LoadedRuntimeConfig["features"][string],
): LoadedRuntimeConfig["features"][string] {
  if (!feature.enabled) {
    return feature;
  }

  return {
    adapter: feature.adapter,
    ...(feature.confirmationRequiredCapabilities
      ? {
          confirmationRequiredCapabilities:
            feature.confirmationRequiredCapabilities,
        }
      : {}),
    enabled: false,
  };
}

function createCommandFixtureStreamArgs(
  config: LoadedRuntimeConfig,
  commandAudioPath: string,
): string[] {
  const effects = commandCaptureEffects(config);
  const input = commandAudioPath.toLocaleLowerCase().endsWith(".wav")
    ? [commandAudioPath]
    : [
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
        commandAudioPath,
      ];

  return [
    ...input,
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
