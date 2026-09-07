import { transcribeVoiceCommand } from "./voice-command-capture.js";
import {
  isVoiceStopCommand,
  stopVoiceOutputForCommand,
} from "./voice-spoken-stop.js";
import { createVoiceInterruption } from "./voice-interruption.js";
import { createVoiceOutputCoordinator } from "./voice-output-coordinator.js";
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
import type { ResolvedVoiceConfig } from "../config/voice-config.js";
import type { VoiceInterruptionRequest } from "./voice-interruption-monitor.js";
import type { VoiceSpeechInterruption } from "./voice-response.js";

interface VoicePipelineConfig {
  initialCommandSource: "command-capture" | "wake-transcript";
  preWakeFailureMode: "fallback" | "throw";
  wakePhrases: string[];
}

interface VoicePipelineDependencies {
  bargeIn?: NonNullable<ResolvedVoiceConfig["bargeIn"]>;
  initialCommand?: VoiceInterruptionRequest;
  interruption?: VoiceSpeechInterruption;
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
  const outputCoordinator =
    dependencies.outputCoordinator ??
    createVoiceOutputCoordinator({
      onCleanupFailure: (error) => controller.quarantine(error),
    });
  const interrupt = createVoiceInterruption(controller, outputCoordinator);
  let interruption: VoiceInterruptionRequest | undefined;
  let interruptionCleanup: Promise<void> | undefined;
  const observed = createVoiceTurnInstrumentation(dependencies.timing);
  const instrumentation: VoiceTurnInstrumentation = {
    mark: (name) => observed.mark(name),
    measure: (name, operation) =>
      observed.measure(name, () => session.run(operation)),
    snapshotIfEnabled: () => observed.snapshotIfEnabled(),
  };
  const scoped = {
    ...dependencies,
    outputCoordinator,
    shutdownSignal: session.signal,
    turnController: controller,
  };
  if (dependencies.bargeIn && !dependencies.initialCommand) {
    scoped.interruption = {
      signal: session.signal,
      wakePhrases: dependencies.turnConfig.wakePhrases,
      capture: (signal) =>
        transcribeVoiceCommand(
          { ...scoped, shutdownSignal: signal },
          {},
          createVoiceTurnInstrumentation(),
        ),
      onRequest: (request) => {
        if (interruptionCleanup || session.signal.aborted) return;
        if (
          isVoiceStopCommand(request.text, dependencies.turnConfig.wakePhrases)
        ) {
          instrumentation.mark("stop_recognized");
        } else {
          interruption = request;
        }
        interruptionCleanup = interrupt().then(
          () => {
            instrumentation.mark("output_stopped");
          },
          (error: unknown) => {
            interruption = undefined;
            controller.quarantine(
              error instanceof Error
                ? error
                : new Error("Voice interruption failed."),
            );
          },
        );
      },
      onCleanupFailure: (error) => controller.quarantine(error),
      reportFailure: (error) => logRuntimeFailure(error, io),
      onCaptureState: (capturing) =>
        io.presentation?.microphoneChanged(
          controller.failed
            ? "unavailable"
            : capturing
              ? "capturing"
              : "available",
        ),
    };
  }
  let result: VoicePipelineResult;
  try {
    result = await runVoicePipelineActivation(scoped, io, instrumentation);
  } catch (error) {
    if (
      session.signal.aborted ||
      dependencies.turnConfig.preWakeFailureMode === "fallback"
    )
      result = await speakPipelineFallback(scoped, io, instrumentation, error);
    else throw error;
  } finally {
    session.dispose();
    await interruptionCleanup;
  }
  return {
    ...result,
    ...timingsResult(instrumentation),
    ...(interruption && !controller.failed ? { interruption } : {}),
  };
}

async function runVoicePipelineActivation(
  dependencies: ActiveVoicePipelineDependencies,
  io: VoiceRuntimeIo,
  instrumentation: VoiceTurnInstrumentation,
): Promise<VoicePipelineResult> {
  const presentation =
    io.presentation ?? createPresentationInteractionCoordinator();
  if (dependencies.initialCommand) {
    return runPostWakeVoiceCommand(dependencies, io, {
      instrumentation,
      presentationInteraction: presentation.beginVoiceInteraction(),
      initialCommandTranscript: dependencies.initialCommand.text,
      wakePhrase: dependencies.initialCommand.wakePhrase,
    });
  }
  logWakeListening(io, dependencies.turnConfig.wakePhrases);
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
        : await transcribeVoiceCommand(
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

    const stopped = (): VoicePipelineResult => ({
      response: { status: "ok", text: "Stopped." },
      status: "cancelled",
      textOutputWritten: false,
      ...timingsResult(metadata.instrumentation),
      transcript: commandTranscript.text,
    });
    if (
      pendingContinuation &&
      !metadata.presentationInteraction.continuationAvailable()
    )
      return stopped();

    if (
      await stopVoiceOutputForCommand({
        text: commandTranscript.text,
        wakePhrases: dependencies.turnConfig.wakePhrases,
        ...(dependencies.outputCoordinator
          ? { outputCoordinator: dependencies.outputCoordinator }
          : {}),
        instrumentation: metadata.instrumentation,
        presentation: metadata.presentationInteraction,
      })
    )
      return stopped();

    if (
      pendingContinuation &&
      !metadata.presentationInteraction.claimContinuation()
    )
      return stopped();

    return await runVoiceCommandSequence(
      dependencies,
      commandTranscript.text,
      io,
      {
        captureFollowUp: () =>
          transcribeVoiceCommand(
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

function timingsResult(
  instrumentation: VoiceTurnInstrumentation,
): Pick<VoiceTurnResult, "timings"> | Record<string, never> {
  const timings = instrumentation.snapshotIfEnabled();

  return timings ? { timings } : {};
}
