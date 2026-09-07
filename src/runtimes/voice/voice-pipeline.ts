import {
  createVoiceTurnController,
  type VoiceTurnController,
} from "./voice-turn-controller.js";
import type { Assistant } from "../../core/assistant/index.js";
import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  TextToSpeechPort,
  WakeActivationPort,
  WakeWordPort,
} from "../../ports/voice.js";
import {
  logRuntimeFailure,
  safeRuntimeFallbackResponse,
} from "../human-boundary.js";
import {
  createPresentationInteractionCoordinator,
  type PresentationInteraction,
} from "../presentation/presentation-interaction-coordinator.js";
import { runVoiceCommandSequence } from "./voice-command-sequence.js";
import { logWakeDetected, logWakeListening } from "./voice-progress.js";
import { speakResponse } from "./voice-response.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";
import {
  createVoiceTurnInstrumentation,
  type VoiceTimingOptions,
  type VoiceTurnInstrumentation,
} from "./voice-timings.js";
import type { VoiceTurnResult } from "./voice-turn-result.js";
import type {
  StreamingVoiceInput,
  StreamingVoiceOutput,
} from "./streaming-voice.js";
import type { VoiceOutputCoordinator } from "./voice-output-coordinator.js";

interface VoicePipelineConfig {
  initialCommandSource: "command-capture" | "wake-transcript";
  preWakeFailureMode: "fallback" | "throw";
  wakePhrases: string[];
}

interface VoicePipelineDependencies {
  assistant: Assistant;
  audioOutput: AudioOutputPort;
  commandAudioInput: AudioInputPort;
  speechToText: SpeechToTextPort;
  outputCoordinator?: VoiceOutputCoordinator;
  shutdownSignal?: AbortSignal;
  streamingInput?: StreamingVoiceInput;
  streamingOutput?: StreamingVoiceOutput;
  textToSpeech: TextToSpeechPort;
  timing?: VoiceTimingOptions;
  turnController?: VoiceTurnController;
  turnConfig: VoicePipelineConfig;
  wakeActivation?: WakeActivationPort;
  wakeAudioInput: AudioInputPort;
  wakeWord: WakeWordPort;
}

interface ActiveVoicePipelineDependencies extends VoicePipelineDependencies {
  shutdownSignal: AbortSignal;
  turnController: VoiceTurnController;
}

export type VoicePipelineResult = VoiceTurnResult;

export async function runVoicePipeline(
  dependencies: VoicePipelineDependencies,
  io: VoiceRuntimeIo = {},
): Promise<VoicePipelineResult> {
  const controller =
    dependencies.turnController ??
    createVoiceTurnController({
      onCleanupFailure: (error) => logRuntimeFailure(error, io),
    });
  const session = controller.begin(dependencies.shutdownSignal);
  const observed = createVoiceTurnInstrumentation(dependencies.timing);
  const instrumentation: VoiceTurnInstrumentation = {
    mark: (name) => observed.mark(name),
    measure: (name, operation) =>
      observed.measure(name, () => session.run(operation)),
    snapshotIfEnabled: () => observed.snapshotIfEnabled(),
  };
  const scoped = {
    ...dependencies,
    shutdownSignal: session.signal,
    turnController: controller,
  };
  try {
    return await runVoicePipelineActivation(scoped, io, instrumentation);
  } catch (error) {
    if (
      session.signal.aborted ||
      dependencies.turnConfig.preWakeFailureMode === "fallback"
    )
      return await speakPipelineFallback(scoped, io, instrumentation, error);
    throw error;
  } finally {
    session.dispose();
  }
}

async function runVoicePipelineActivation(
  dependencies: ActiveVoicePipelineDependencies,
  io: VoiceRuntimeIo,
  instrumentation: VoiceTurnInstrumentation,
): Promise<VoicePipelineResult> {
  logWakeListening(io, dependencies.turnConfig.wakePhrases);
  const presentation =
    io.presentation ?? createPresentationInteractionCoordinator();
  presentation.wakeListening();

  if (dependencies.wakeActivation) {
    const { wakeActivation } = dependencies;
    const activation = await instrumentation.measure("wake activation", () =>
      wakeActivation.waitForWake(
        {
          wakePhrases: dependencies.turnConfig.wakePhrases,
        },
        { signal: dependencies.shutdownSignal },
      ),
    );

    instrumentation.mark("wake_detected");
    logWakeDetected(io);

    const presentationInteraction = presentation.beginVoiceInteraction();
    if (io.presentation || io.progressOutput)
      instrumentation.mark("local_feedback");

    return runPostWakeVoiceCommand(dependencies, io, {
      instrumentation,
      presentationInteraction,
      ...(activation?.phrase ? { wakePhrase: activation.phrase } : {}),
    });
  }

  const wakeAudio = await instrumentation.measure("wake audio capture", () =>
    dependencies.wakeAudioInput.capture({
      signal: dependencies.shutdownSignal,
    }),
  );
  const wakeTranscript = await instrumentation.measure(
    "wake speech-to-text",
    () =>
      dependencies.speechToText.transcribe(wakeAudio, {
        signal: dependencies.shutdownSignal,
      }),
  );
  const detection = await instrumentation.measure("wake word detection", () =>
    dependencies.wakeWord.detect(
      {
        audio: {
          ...wakeAudio,
          text: wakeTranscript.text,
        },
        wakePhrases: dependencies.turnConfig.wakePhrases,
      },
      { signal: dependencies.shutdownSignal },
    ),
  );

  if (!detection.detected) {
    return {
      response: {
        status: "unknown",
        text: "Wake phrase not detected.",
      },
      status: "ignored",
      textOutputWritten: false,
      ...timingsResult(instrumentation),
      transcript: wakeTranscript.text,
    };
  }

  instrumentation.mark("wake_detected");
  logWakeDetected(io);

  const presentationInteraction = presentation.beginVoiceInteraction();
  if (io.presentation || io.progressOutput)
    instrumentation.mark("local_feedback");

  return runPostWakeVoiceCommand(dependencies, io, {
    instrumentation,
    presentationInteraction,
    ...(dependencies.turnConfig.initialCommandSource === "wake-transcript"
      ? { initialCommandTranscript: wakeTranscript.text }
      : {}),
    ...(detection.phrase ? { wakePhrase: detection.phrase } : {}),
  });
}

async function runPostWakeVoiceCommand(
  dependencies: ActiveVoicePipelineDependencies,
  io: VoiceRuntimeIo,
  metadata: {
    initialCommandTranscript?: string;
    instrumentation: VoiceTurnInstrumentation;
    presentationInteraction: PresentationInteraction;
    wakePhrase?: string;
  },
): Promise<VoicePipelineResult> {
  try {
    const pendingContinuation =
      metadata.presentationInteraction.continuationAvailable();
    const commandTranscript =
      metadata.initialCommandTranscript !== undefined
        ? { text: metadata.initialCommandTranscript }
        : await transcribeCommand(
            dependencies,
            io,
            metadata.instrumentation,
            metadata.presentationInteraction,
            () =>
              !pendingContinuation ||
              metadata.presentationInteraction.continuationAvailable(),
          );

    if (metadata.initialCommandTranscript !== undefined) {
      metadata.instrumentation.mark("first_transcript");
      metadata.presentationInteraction.transcriptFinal(commandTranscript.text);
    }

    if (
      pendingContinuation &&
      !metadata.presentationInteraction.claimContinuation()
    ) {
      return {
        response: { status: "ok", text: "Stopped." },
        status: "cancelled",
        textOutputWritten: false,
        ...timingsResult(metadata.instrumentation),
      };
    }

    return await runVoiceCommandSequence(
      dependencies,
      commandTranscript.text,
      io,
      {
        captureFollowUp: () =>
          transcribeCommand(
            dependencies,
            io,
            metadata.instrumentation,
            metadata.presentationInteraction,
            () => metadata.presentationInteraction.continuationAvailable(),
          ),
        instrumentation: metadata.instrumentation,
        presentationInteraction: metadata.presentationInteraction,
        ...(metadata.wakePhrase ? { wakePhrase: metadata.wakePhrase } : {}),
      },
    );
  } catch (error) {
    return speakPipelineFallback(
      dependencies,
      io,
      metadata.instrumentation,
      error,
      {
        presentationInteraction: metadata.presentationInteraction,
        ...(metadata.wakePhrase ? { wakePhrase: metadata.wakePhrase } : {}),
      },
    );
  }
}

async function speakPipelineFallback(
  dependencies: ActiveVoicePipelineDependencies,
  io: VoiceRuntimeIo,
  instrumentation: VoiceTurnInstrumentation,
  error: unknown,
  metadata: {
    presentationInteraction?: PresentationInteraction;
    wakePhrase?: string;
  } = {},
): Promise<VoicePipelineResult> {
  if (dependencies.shutdownSignal.aborted) {
    metadata.presentationInteraction?.interrupted();
    return {
      response: dependencies.turnController.failed
        ? safeRuntimeFallbackResponse
        : { status: "ok", text: "Stopped." },
      status: "cancelled",
      textOutputWritten: false,
      ...timingsResult(instrumentation),
    };
  }
  logRuntimeFailure(error, io);

  metadata.presentationInteraction?.failed(safeRuntimeFallbackResponse.text);

  const speechOutput = await speakResponse(
    dependencies,
    safeRuntimeFallbackResponse,
    io,
  );

  return {
    response: safeRuntimeFallbackResponse,
    ...speechOutput,
    ...timingsResult(instrumentation),
    ...(metadata.wakePhrase ? { wakePhrase: metadata.wakePhrase } : {}),
  };
}

async function transcribeCommand(
  dependencies: ActiveVoicePipelineDependencies,
  io: VoiceRuntimeIo,
  instrumentation: VoiceTurnInstrumentation,
  presentationInteraction: PresentationInteraction,
  shouldPublish: () => boolean = () => true,
): Promise<{ text: string }> {
  if (dependencies.streamingInput) {
    const { audioInput, speechToText } = dependencies.streamingInput;
    const audio = await instrumentation.measure("command stream setup", () =>
      audioInput.captureStream({ signal: dependencies.shutdownSignal }),
    );

    return instrumentation
      .measure("command transcription", () =>
        speechToText.transcribeStream(
          { chunks: markStreamEnd(audio.chunks, instrumentation) },
          {
            onTranscriptDelta: (delta) => {
              if (dependencies.shutdownSignal.aborted) return;
              if (delta) instrumentation.mark("first_transcript");
              io.progressOutput?.write(delta);
              if (shouldPublish())
                presentationInteraction.transcriptDelta(delta);
            },
          },
          { signal: dependencies.shutdownSignal },
        ),
      )
      .then((transcript) => {
        instrumentation.mark("first_transcript");
        if (shouldPublish())
          presentationInteraction.transcriptFinal(transcript.text);
        return transcript;
      });
  }

  const commandAudio = await instrumentation.measure(
    "command audio capture",
    () =>
      dependencies.commandAudioInput.capture({
        signal: dependencies.shutdownSignal,
      }),
  );

  instrumentation.mark("capture_completed");
  return instrumentation
    .measure("command speech-to-text", () =>
      dependencies.speechToText.transcribe(commandAudio, {
        signal: dependencies.shutdownSignal,
      }),
    )
    .then((transcript) => {
      instrumentation.mark("first_transcript");
      if (shouldPublish())
        presentationInteraction.transcriptFinal(transcript.text);
      return transcript;
    });
}

function timingsResult(
  instrumentation: VoiceTurnInstrumentation,
): Pick<VoiceTurnResult, "timings"> | Record<string, never> {
  const timings = instrumentation.snapshotIfEnabled();

  return timings ? { timings } : {};
}

async function* markStreamEnd(
  chunks: AsyncIterable<Uint8Array>,
  instrumentation: VoiceTurnInstrumentation,
): AsyncIterable<Uint8Array> {
  yield* chunks;
  instrumentation.mark("capture_completed");
}
