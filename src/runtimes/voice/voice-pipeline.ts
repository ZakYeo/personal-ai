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
  turnConfig: VoicePipelineConfig;
  wakeActivation?: WakeActivationPort;
  wakeAudioInput: AudioInputPort;
  wakeWord: WakeWordPort;
}

export type VoicePipelineResult = VoiceTurnResult;

export async function runVoicePipeline(
  dependencies: VoicePipelineDependencies,
  io: VoiceRuntimeIo = {},
): Promise<VoicePipelineResult> {
  const instrumentation = createVoiceTurnInstrumentation(dependencies.timing);

  if (dependencies.turnConfig.preWakeFailureMode === "fallback") {
    try {
      return await runVoicePipelineActivation(
        dependencies,
        io,
        instrumentation,
      );
    } catch (error) {
      return speakPipelineFallback(dependencies, io, instrumentation, error);
    }
  }

  return runVoicePipelineActivation(dependencies, io, instrumentation);
}

async function runVoicePipelineActivation(
  dependencies: VoicePipelineDependencies,
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
      wakeActivation.waitForWake({
        wakePhrases: dependencies.turnConfig.wakePhrases,
      }),
    );

    logWakeDetected(io);

    const presentationInteraction = presentation.beginInteraction();

    return runPostWakeVoiceCommand(dependencies, io, {
      instrumentation,
      presentationInteraction,
      ...(activation?.phrase ? { wakePhrase: activation.phrase } : {}),
    });
  }

  const wakeAudio = await instrumentation.measure("wake audio capture", () =>
    dependencies.wakeAudioInput.capture(),
  );
  const wakeTranscript = await instrumentation.measure(
    "wake speech-to-text",
    () => dependencies.speechToText.transcribe(wakeAudio),
  );
  const detection = await instrumentation.measure("wake word detection", () =>
    dependencies.wakeWord.detect({
      audio: {
        ...wakeAudio,
        text: wakeTranscript.text,
      },
      wakePhrases: dependencies.turnConfig.wakePhrases,
    }),
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

  logWakeDetected(io);

  const presentationInteraction = presentation.beginInteraction();

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
  dependencies: VoicePipelineDependencies,
  io: VoiceRuntimeIo,
  metadata: {
    initialCommandTranscript?: string;
    instrumentation: VoiceTurnInstrumentation;
    presentationInteraction: PresentationInteraction;
    wakePhrase?: string;
  },
): Promise<VoicePipelineResult> {
  try {
    const commandTranscript =
      metadata.initialCommandTranscript !== undefined
        ? { text: metadata.initialCommandTranscript }
        : await transcribeCommand(
            dependencies,
            io,
            metadata.instrumentation,
            metadata.presentationInteraction,
          );

    if (metadata.initialCommandTranscript !== undefined) {
      metadata.presentationInteraction.transcriptFinal(commandTranscript.text);
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
  dependencies: VoicePipelineDependencies,
  io: VoiceRuntimeIo,
  instrumentation: VoiceTurnInstrumentation,
  error: unknown,
  metadata: {
    presentationInteraction?: PresentationInteraction;
    wakePhrase?: string;
  } = {},
): Promise<VoicePipelineResult> {
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
  dependencies: VoicePipelineDependencies,
  io: VoiceRuntimeIo,
  instrumentation: VoiceTurnInstrumentation,
  presentationInteraction: PresentationInteraction,
): Promise<{ text: string }> {
  if (dependencies.streamingInput) {
    const { audioInput, speechToText } = dependencies.streamingInput;
    const audio = await instrumentation.measure("command stream setup", () =>
      audioInput.captureStream(),
    );

    return instrumentation
      .measure("command transcription", () =>
        speechToText.transcribeStream(audio, {
          onTranscriptDelta: (delta) => {
            io.progressOutput?.write(delta);
            presentationInteraction.transcriptDelta(delta);
          },
        }),
      )
      .then((transcript) => {
        presentationInteraction.transcriptFinal(transcript.text);
        return transcript;
      });
  }

  const commandAudio = await instrumentation.measure(
    "command audio capture",
    () => dependencies.commandAudioInput.capture(),
  );

  return instrumentation
    .measure("command speech-to-text", () =>
      dependencies.speechToText.transcribe(commandAudio),
    )
    .then((transcript) => {
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
