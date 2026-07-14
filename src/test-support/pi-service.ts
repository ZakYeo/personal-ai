import { readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { isRecord } from "../adapters/parsing.js";
import type { DesktopVoiceServiceAdapters } from "../runtimes/voice/desktop-voice-adapter-types.js";
import type { ServiceTurnFailureContext } from "../runtimes/service/service-runtime.js";
import { writePersistentAlarmRuntimeConfig } from "./runtime-composition.js";

interface PiServiceRawConfig extends Record<string, unknown> {
  features: Record<string, unknown>;
  intent: Record<string, unknown>;
}

interface EmittingServiceSignals {
  emit(signal: "SIGTERM"): void;
}

export async function createPiServiceAlarmFixture(): Promise<{
  cleanup(): Promise<void>;
  configPath: string;
  rawConfig: PiServiceRawConfig;
  statePath: string;
}> {
  const rawConfig = await loadCheckedInPiServiceConfig();
  const { configPath, statePath } =
    await writePersistentAlarmRuntimeConfig(rawConfig);

  return {
    cleanup: () => rm(dirname(configPath), { force: true, recursive: true }),
    configPath,
    rawConfig,
    statePath,
  };
}

export function createPiServiceAdapterDoubles(): DesktopVoiceServiceAdapters {
  return {
    audioInput: {
      capture: () => Promise.resolve({ text: "unused command audio" }),
    },
    audioOutput: { play: () => Promise.resolve() },
    speechToText: {
      transcribe: (audio) => Promise.resolve({ text: audio.text }),
    },
    textToSpeech: {
      synthesize: (text) => Promise.resolve({ text }),
    },
    wakeAudioInput: {
      capture: () => Promise.resolve({ text: "hey jarvis" }),
    },
    wakeWord: {
      detect: () => Promise.resolve({ detected: true, phrase: "hey jarvis" }),
    },
  };
}

export function createStopAfterPiServiceFailure(
  signals: EmittingServiceSignals,
): (context?: ServiceTurnFailureContext) => Promise<void> {
  return () => {
    signals.emit("SIGTERM");
    return Promise.resolve();
  };
}

async function loadCheckedInPiServiceConfig(): Promise<PiServiceRawConfig> {
  const parsed: unknown = JSON.parse(
    await readFile("config/pi-voice-openai.example.json", "utf8"),
  );

  if (
    !isRecord(parsed) ||
    !isRecord(parsed.features) ||
    !isRecord(parsed.intent)
  ) {
    throw new Error(
      "Checked-in Pi service config must contain object sections.",
    );
  }

  return {
    ...parsed,
    features: parsed.features,
    intent: parsed.intent,
  };
}
