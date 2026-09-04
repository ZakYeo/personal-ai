import { assistantResponseExpectsFollowUp } from "../../application/assistant-response.js";
import {
  runDetectedVoiceCommand,
  type VoiceCommandDependencies,
} from "./voice-command.js";
import { logFollowUpListening } from "./voice-progress.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";
import type { VoiceTurnResult } from "./voice-turn-result.js";
import type { VoiceTurnInstrumentation } from "./voice-timings.js";

const defaultMaxFollowUpTurns = 3;

export async function runVoiceCommandSequence(
  dependencies: VoiceCommandDependencies,
  initialCommandText: string,
  io: VoiceRuntimeIo,
  metadata: {
    captureFollowUp: () => Promise<{ text: string }>;
    instrumentation: VoiceTurnInstrumentation;
    maxFollowUpTurns?: number;
    presentationInteractionId?: string;
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
    if (metadata.presentationInteractionId) {
      io.presentation?.publish({
        interactionId: metadata.presentationInteractionId,
        type: "follow_up_listening",
      });
    }

    const followUpTranscript = await metadata.captureFollowUp();

    result = await runDetectedVoiceCommand(
      dependencies,
      followUpTranscript.text,
      io,
      metadata,
    );
  }

  if (
    metadata.presentationInteractionId &&
    !assistantResponseExpectsFollowUp(result.response)
  ) {
    io.presentation?.publish({
      interactionId: metadata.presentationInteractionId,
      type: "completed",
    });
  }

  return result;
}
