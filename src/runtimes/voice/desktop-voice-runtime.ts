import type { LoadedRuntimeConfig } from "../config/config.js";
import type { VoiceRuntimeIo } from "./voice-turn.js";
import { createDesktopVoiceAdapters } from "./desktop-voice-adapter-registry.js";
import {
  createVoiceRuntime,
  type VoiceRuntime,
} from "./voice-runtime-factory.js";

interface DesktopVoiceRuntimeOptions {
  config?: LoadedRuntimeConfig;
  configPath?: string;
  io?: VoiceRuntimeIo;
  now?: Date;
}

export async function createDesktopVoiceRuntime(
  options: DesktopVoiceRuntimeOptions = {},
): Promise<VoiceRuntime> {
  return createVoiceRuntime({
    adapterOptions: undefined,
    createAdapters: createDesktopVoiceAdapters,
    ...(options.config ? { config: options.config } : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
    ...(options.io ? { io: options.io } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
}
