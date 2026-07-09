import type { AssistantResponse } from "../../ports/assistant.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";

export function logVoiceProgress(io: VoiceRuntimeIo, message: string): void {
  io.progressOutput?.write(`${message}\n`);
}

export function logWakeListening(
  io: VoiceRuntimeIo,
  wakePhrases: string[],
): void {
  logVoiceProgress(
    io,
    `Now listening for wake word ${formatWakePhraseList(wakePhrases)}.`,
  );
}

export function logWakeDetected(io: VoiceRuntimeIo): void {
  logVoiceProgress(io, "Wake word detected, now listening...");
}

export function logFollowUpListening(io: VoiceRuntimeIo): void {
  logVoiceProgress(io, "Listening for your reply...");
}

export function logCommandTranscript(
  io: VoiceRuntimeIo,
  commandText: string,
): void {
  logVoiceProgress(io, `Heard: ${commandText}`);
}

export function logAssistantResponse(
  io: VoiceRuntimeIo,
  response: AssistantResponse,
): void {
  logVoiceProgress(io, `Assistant: ${response.text}`);
}

function formatWakePhraseList(wakePhrases: string[]): string {
  return wakePhrases.map((wakePhrase) => `"${wakePhrase}"`).join(" or ");
}
