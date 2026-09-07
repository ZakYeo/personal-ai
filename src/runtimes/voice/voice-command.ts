import type { Assistant } from "../../core/assistant/index.js";
import type { AudioOutputPort, TextToSpeechPort } from "../../ports/voice.js";
import {
  logAssistantResponse,
  logCommandTranscript,
} from "./voice-progress.js";
import {
  speakResponse,
  type VoiceSpeechInterruption,
} from "./voice-response.js";
import {
  readAssistantOutcome,
  recordPresentedOutcome,
} from "../human-boundary.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";
import {
  createVoiceTurnInstrumentation,
  type VoiceTurnInstrumentation,
} from "./voice-timings.js";
import type { VoiceTurnResult } from "./voice-turn-result.js";
import type { StreamingVoiceOutput } from "./streaming-voice.js";
import type { VoiceOutputCoordinator } from "./voice-output-coordinator.js";
import type { PresentationInteraction } from "../presentation/presentation-interaction-coordinator.js";

export interface VoiceCommandDependencies {
  interruption?: VoiceSpeechInterruption;
  assistant: Assistant;
  audioOutput: AudioOutputPort;
  outputCoordinator?: VoiceOutputCoordinator;
  shutdownSignal?: AbortSignal;
  streamingOutput?: StreamingVoiceOutput;
  textToSpeech: TextToSpeechPort;
}

export async function runDetectedVoiceCommand(
  dependencies: VoiceCommandDependencies,
  commandText: string,
  io: VoiceRuntimeIo,
  metadata: {
    instrumentation?: VoiceTurnInstrumentation;
    presentationInteraction?: PresentationInteraction;
    wakePhrase?: string;
  } = {},
): Promise<VoiceTurnResult> {
  const instrumentation =
    metadata.instrumentation ?? createVoiceTurnInstrumentation();

  metadata.presentationInteraction?.processing();

  logCommandTranscript(io, commandText);

  const outcome = await instrumentation.measure("assistant handling", () =>
    readAssistantOutcome(
      dependencies.assistant,
      commandText,
      io,
      dependencies.shutdownSignal,
    ),
  );
  const response = outcome.response;

  logAssistantResponse(io, response);

  if (metadata.presentationInteraction) {
    if (response.status === "needs_confirmation") {
      metadata.presentationInteraction.confirmation(response.text);
    } else {
      metadata.presentationInteraction.response(response);
      metadata.presentationInteraction.speakingStarted();
    }
  }

  const speechOutput = await instrumentation.measure("speech output", () =>
    speakResponse(
      {
        ...dependencies,
        ...(dependencies.interruption
          ? {
              interruption: {
                ...dependencies.interruption,
                onRequest: (request) => {
                  if (
                    (response.status === "needs_confirmation" ||
                      response.expectsFollowUp) &&
                    metadata.presentationInteraction?.continuationAvailable() ===
                      false
                  )
                    return;
                  dependencies.interruption?.onRequest(request);
                },
              },
            }
          : {}),
        onFirstAudioSubmitted: () =>
          instrumentation.mark("first_audio_submitted"),
      },
      response,
      io,
    ),
  );
  if (speechOutput.status === "spoken")
    await recordPresentedOutcome(outcome, io);
  if (
    metadata.presentationInteraction &&
    response.status !== "needs_confirmation"
  ) {
    metadata.presentationInteraction.speakingFinished();
  }
  const timings = instrumentation.snapshotIfEnabled();

  return {
    response,
    ...speechOutput,
    ...(timings ? { timings } : {}),
    transcript: commandText,
    ...(metadata.wakePhrase ? { wakePhrase: metadata.wakePhrase } : {}),
  };
}
