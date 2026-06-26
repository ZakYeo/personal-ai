import { createDeterministicRuntime } from "../deterministic-runtime.js";
import { loadConfig } from "../config/config.js";
import type { AssistantConfig } from "../../ports/assistant.js";
import {
  runVoiceTurn,
  type VoiceRuntimeDependencies,
  type VoiceRuntimeIo,
  type VoiceTurnResult,
} from "./voice-turn.js";
import { createDesktopVoiceAdapters } from "./desktop-voice-adapter-registry.js";

interface DesktopVoiceRuntimeOptions {
  config?: AssistantConfig;
  configPath?: string;
  io?: VoiceRuntimeIo;
  now?: Date;
}

interface DesktopVoiceRuntime {
  runOnce(): Promise<VoiceTurnResult>;
}

export async function createDesktopVoiceRuntime(
  options: DesktopVoiceRuntimeOptions = {},
): Promise<DesktopVoiceRuntime> {
  const config =
    options.config ??
    (await loadConfig(
      options.configPath ? { configPath: options.configPath } : undefined,
    ));
  const voiceAdapters = createDesktopVoiceAdapters(config);

  const dependencies: VoiceRuntimeDependencies = {
    assistant: await createDeterministicRuntime({
      config,
      ...(options.now ? { now: options.now } : {}),
    }),
    audioInput: voiceAdapters.audioInput,
    audioOutput: voiceAdapters.audioOutput,
    config,
    speechToText: voiceAdapters.speechToText,
    textToSpeech: voiceAdapters.textToSpeech,
    wakeWord: voiceAdapters.wakeWord,
  };

  return {
    runOnce: () => runVoiceTurn(dependencies, options.io),
  };
}
