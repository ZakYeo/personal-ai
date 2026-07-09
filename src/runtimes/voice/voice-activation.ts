import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  StreamingAudioInputPort,
  StreamingAudioOutputPort,
  StreamingSpeechToTextPort,
  StreamingTextToSpeechPort,
  TextToSpeechPort,
  WakeActivationPort,
  WakeWordPort,
} from "../../ports/voice.js";
import type { Assistant } from "../../core/assistant/index.js";
import {
  logRuntimeFailure,
  safeRuntimeFallbackResponse,
} from "../human-boundary.js";
import { runVoiceCommandSequence } from "./voice-command-sequence.js";
import { logWakeDetected, logWakeListening } from "./voice-progress.js";
import { speakResponse } from "./voice-response.js";
import {
  createVoiceTurnInstrumentation,
  type VoiceTimingOptions,
  type VoiceTurnInstrumentation,
} from "./voice-timings.js";
import type { VoiceRuntimeIo, VoiceTurnConfig } from "./voice-turn.js";
import type { VoiceTurnResult } from "./voice-turn-result.js";

export interface VoiceActivationDependencies {
  assistant: Assistant;
  audioOutput: AudioOutputPort;
  commandAudioInput: AudioInputPort;
  speechToText: SpeechToTextPort;
  streamingAudioInput?: StreamingAudioInputPort;
  streamingAudioOutput?: StreamingAudioOutputPort;
  streamingSpeechToText?: StreamingSpeechToTextPort;
  streamingTextToSpeech?: StreamingTextToSpeechPort;
  textToSpeech: TextToSpeechPort;
  timing?: VoiceTimingOptions;
  turnConfig: VoiceTurnConfig;
  wakeActivation?: WakeActivationPort;
  wakeAudioInput: AudioInputPort;
  wakeWord: WakeWordPort;
}

export type VoiceActivationResult = VoiceTurnResult;

export async function runVoiceActivation(
  dependencies: VoiceActivationDependencies,
  io: VoiceRuntimeIo = {},
): Promise<VoiceActivationResult> {
  const instrumentation = createVoiceTurnInstrumentation(dependencies.timing);

  logWakeListening(io, dependencies.turnConfig.wakePhrases);

  if (dependencies.wakeActivation) {
    const { wakeActivation } = dependencies;
    const activation = await instrumentation.measure("wake activation", () =>
      wakeActivation.waitForWake({
        wakePhrases: dependencies.turnConfig.wakePhrases,
      }),
    );

    logWakeDetected(io);

    return runPostWakeVoiceCommand(dependencies, io, {
      instrumentation,
      ...(activation.phrase ? { wakePhrase: activation.phrase } : {}),
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

  return runPostWakeVoiceCommand(dependencies, io, {
    instrumentation,
    ...(detection.phrase ? { wakePhrase: detection.phrase } : {}),
  });
}

async function runPostWakeVoiceCommand(
  dependencies: VoiceActivationDependencies,
  io: VoiceRuntimeIo,
  metadata: { instrumentation: VoiceTurnInstrumentation; wakePhrase?: string },
): Promise<VoiceActivationResult> {
  try {
    const commandTranscript = await transcribeCommand(
      dependencies,
      io,
      metadata.instrumentation,
    );

    return await runVoiceCommandSequence(
      dependencies,
      commandTranscript.text,
      io,
      {
        captureFollowUp: () =>
          transcribeCommand(dependencies, io, metadata.instrumentation),
        instrumentation: metadata.instrumentation,
        ...(metadata.wakePhrase ? { wakePhrase: metadata.wakePhrase } : {}),
      },
    );
  } catch (error) {
    logRuntimeFailure(error, io);

    const speechOutput = await speakResponse(
      dependencies,
      safeRuntimeFallbackResponse,
      io,
    );

    return {
      response: safeRuntimeFallbackResponse,
      ...speechOutput,
      ...timingsResult(metadata.instrumentation),
      ...(metadata.wakePhrase ? { wakePhrase: metadata.wakePhrase } : {}),
    };
  }
}

async function transcribeCommand(
  dependencies: VoiceActivationDependencies,
  io: VoiceRuntimeIo,
  instrumentation: VoiceTurnInstrumentation,
): Promise<{ text: string }> {
  if (dependencies.streamingAudioInput && dependencies.streamingSpeechToText) {
    const { streamingAudioInput, streamingSpeechToText } = dependencies;
    const audio = await instrumentation.measure("command stream setup", () =>
      streamingAudioInput.captureStream(),
    );

    return instrumentation.measure("command transcription", () =>
      streamingSpeechToText.transcribeStream(audio, {
        onTranscriptDelta: (delta) => {
          io.progressOutput?.write(delta);
        },
      }),
    );
  }

  const commandAudio = await instrumentation.measure(
    "command audio capture",
    () => dependencies.commandAudioInput.capture(),
  );

  return instrumentation.measure("command speech-to-text", () =>
    dependencies.speechToText.transcribe(commandAudio),
  );
}

function timingsResult(
  instrumentation: VoiceTurnInstrumentation,
): Pick<VoiceTurnResult, "timings"> | Record<string, never> {
  const timings = instrumentation.snapshotIfEnabled();

  return timings ? { timings } : {};
}
