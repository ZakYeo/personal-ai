import type { ConfiguredTextRuntimeOptions } from "../configured-text-runtime.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
import { createNodeProcessControl } from "../process-control.js";
import type { VoiceRuntimeIo } from "./voice-turn.js";
import {
  createDesktopVoiceAdapters,
  resolveDesktopVoiceAdapterConfig,
} from "./desktop-voice-adapter-registry.js";
import {
  createVoiceRuntime,
  type VoiceRuntime,
} from "./voice-runtime-factory.js";
import type { ProcessControl } from "../../adapters/desktop/process-runner.js";

interface DesktopVoiceRuntimeOptions extends Pick<
  ConfiguredTextRuntimeOptions,
  "env" | "fetch" | "now"
> {
  config?: LoadedRuntimeConfig;
  configPath?: string;
  io?: VoiceRuntimeIo;
  processControl?: ProcessControl;
}

export async function createDesktopVoiceRuntime(
  options: DesktopVoiceRuntimeOptions = {},
): Promise<VoiceRuntime> {
  const env = options.env ?? process.env;
  const fetch = options.fetch ?? globalThis.fetch;
  const processControl =
    options.processControl ?? createNodeProcessControl(process);

  return createVoiceRuntime({
    ...(options.config ? { config: options.config } : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
    env,
    fetch,
    ...(options.io ? { io: options.io } : {}),
    ...(options.now ? { now: options.now } : {}),
    resolveAdapters: (config, voiceConfig) =>
      createDesktopVoiceAdapters(
        voiceConfig,
        resolveDesktopVoiceAdapterConfig(voiceConfig, config),
        {
          env,
          fetch,
          processControl,
        },
      ),
  });
}
