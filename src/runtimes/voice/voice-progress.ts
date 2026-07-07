import type { VoiceRuntimeIo } from "./voice-runtime-io.js";

export function logVoiceProgress(io: VoiceRuntimeIo, message: string): void {
  io.progressOutput?.write(`${message}\n`);
}

export function formatWakePhraseList(wakePhrases: string[]): string {
  return wakePhrases.map((wakePhrase) => `"${wakePhrase}"`).join(" or ");
}
