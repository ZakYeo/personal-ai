import { logRuntimeFailure } from "../human-boundary.js";
import type { VoiceRuntimeIo } from "./voice-turn.js";

export async function cleanupVoiceAdapters(
  cleanup: (() => Promise<void> | undefined) | undefined,
  io: VoiceRuntimeIo = {},
): Promise<void> {
  try {
    await cleanup?.();
  } catch (error) {
    logRuntimeFailure(error, io);
  }
}
