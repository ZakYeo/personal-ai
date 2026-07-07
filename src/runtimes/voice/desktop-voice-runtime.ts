import type { ConfiguredTextRuntimeOptions } from "../configured-text-runtime.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
import { requireDesktopVoiceConfig } from "../config/desktop-voice-config.js";
import type { VoiceRuntimeIo } from "./voice-turn.js";
import { createDesktopVoiceAdapters } from "./desktop-voice-adapter-registry.js";
import {
  createVoiceRuntime,
  type VoiceRuntime,
} from "./voice-runtime-factory.js";

interface DesktopVoiceRuntimeOptions extends Pick<
  ConfiguredTextRuntimeOptions,
  "env" | "fetch" | "now"
> {
  config?: LoadedRuntimeConfig;
  configPath?: string;
  io?: VoiceRuntimeIo;
}

export async function createDesktopVoiceRuntime(
  options: DesktopVoiceRuntimeOptions = {},
): Promise<VoiceRuntime> {
  return createVoiceRuntime({
    ...(options.config ? { config: options.config } : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
    ...(options.env ? { env: options.env } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.io ? { io: options.io } : {}),
    ...(options.now ? { now: options.now } : {}),
    resolveAdapters: (config, voiceConfig) =>
      createDesktopVoiceAdapters(
        voiceConfig,
        requireDesktopVoiceConfig(config),
        {
          ...(options.env ? { env: options.env } : {}),
          ...(options.fetch ? { fetch: options.fetch } : {}),
        },
      ),
  });
}
