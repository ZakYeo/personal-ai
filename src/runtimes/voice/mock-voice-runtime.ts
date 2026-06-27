import type { LoadedRuntimeConfig } from "../config/config.js";
import type { VoiceRuntimeIo } from "./voice-turn.js";
import { createMockVoiceAdapters } from "./mock-voice-adapter-registry.js";
import {
  createVoiceRuntime,
  type VoiceRuntime,
} from "./voice-runtime-factory.js";

interface MockVoiceRuntimeOptions {
  config?: LoadedRuntimeConfig;
  configPath?: string;
  io?: VoiceRuntimeIo;
  now?: Date;
  utterance?: string;
}

export async function createMockVoiceRuntime(
  options: MockVoiceRuntimeOptions = {},
): Promise<VoiceRuntime> {
  const utterance =
    options.utterance ??
    "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?";

  return createVoiceRuntime({
    adapterOptions: { utterance },
    createAdapters: createMockVoiceAdapters,
    ...(options.config ? { config: options.config } : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
    ...(options.io ? { io: options.io } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
}
