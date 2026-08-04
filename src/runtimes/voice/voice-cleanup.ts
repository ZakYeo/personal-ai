import { logRuntimeFailure } from "../human-boundary.js";
import type { VoiceRuntimeIo } from "./voice-turn.js";
import { waitForCleanupWithinDeadline } from "../bounded-cleanup.js";

export async function cleanupVoiceAdapters(
  cleanup: (() => Promise<void> | undefined) | undefined,
  io: VoiceRuntimeIo = {},
  deadlineMs = 1_000,
): Promise<void> {
  if (!cleanup) {
    return;
  }

  const error = await waitForCleanupWithinDeadline(
    Promise.resolve().then(() => cleanup()),
    deadlineMs,
    `Voice adapter cleanup did not finish within ${deadlineMs}ms.`,
  );

  if (error) {
    logRuntimeFailure(error, io);
  }
}
