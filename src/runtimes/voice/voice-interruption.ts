import type { VoiceTurnController } from "./voice-turn-controller.js";
import type { VoiceOutputCoordinator } from "./voice-output-coordinator.js";

export function createVoiceInterruption(
  turns: Pick<VoiceTurnController, "cancel">,
  output: Pick<VoiceOutputCoordinator, "interrupt">,
): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () => {
    pending ??= Promise.allSettled([turns.cancel(), output.interrupt()])
      .then((results) => {
        const failures = results.flatMap((result) =>
          result.status === "rejected" ? [result.reason as unknown] : [],
        );
        if (failures.length > 0)
          throw new AggregateError(
            failures,
            "Voice interruption cleanup failed.",
          );
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
}
