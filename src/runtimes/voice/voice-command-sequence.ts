import { assistantResponseExpectsFollowUp } from "../../application/assistant-response.js";
import {
  runDetectedVoiceCommand,
  type VoiceCommandDependencies,
} from "./voice-command.js";
import { logFollowUpListening } from "./voice-progress.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";
import type { VoiceTurnResult } from "./voice-turn-result.js";
import type { VoiceTurnInstrumentation } from "./voice-timings.js";
import type { PresentationInteraction } from "../presentation/presentation-interaction-coordinator.js";

const defaultMaxFollowUpTurns = 3;

export async function runVoiceCommandSequence(
  dependencies: VoiceCommandDependencies,
  initialCommandText: string,
  io: VoiceRuntimeIo,
  metadata: {
    captureFollowUp: () => Promise<{ text: string }>;
    instrumentation: VoiceTurnInstrumentation;
    maxFollowUpTurns?: number;
    presentationInteraction?: PresentationInteraction;
    wakePhrase?: string;
  },
): Promise<VoiceTurnResult> {
  let result = await runDetectedVoiceCommand(
    dependencies,
    initialCommandText,
    io,
    metadata,
  );
  let followUpTurns = 0;
  const maxFollowUpTurns = metadata.maxFollowUpTurns ?? defaultMaxFollowUpTurns;

  while (
    assistantResponseExpectsFollowUp(result.response) &&
    followUpTurns < maxFollowUpTurns
  ) {
    followUpTurns += 1;
    logFollowUpListening(io);
    if (metadata.presentationInteraction?.followUpListening() === false) {
      return result;
    }

    const followUpTranscript = await metadata.captureFollowUp();
    if (metadata.presentationInteraction?.claimContinuation() === false) {
      return result;
    }

    result = await runDetectedVoiceCommand(
      dependencies,
      followUpTranscript.text,
      io,
      metadata,
    );
  }

  if (metadata.presentationInteraction) {
    if (assistantResponseExpectsFollowUp(result.response)) {
      metadata.presentationInteraction.failed(
        "This interaction needs another reply. Please start it again.",
      );
    } else {
      metadata.presentationInteraction.completed();
    }
  }

  return result;
}
