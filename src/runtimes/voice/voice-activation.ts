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
import { runDetectedVoiceCommand } from "./voice-command.js";
import { logWakeDetected, logWakeListening } from "./voice-progress.js";
import { speakResponse } from "./voice-response.js";
import {
  createVoiceTimingRecorder,
  type MonotonicNow,
  type VoiceTimingRecorder,
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
  timing?: { nowMs?: MonotonicNow };
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
  const timingRecorder = dependencies.timing
    ? createVoiceTimingRecorder(dependencies.timing.nowMs)
    : undefined;

  logWakeListening(io, dependencies.turnConfig.wakePhrases);

  if (dependencies.wakeActivation) {
    const { wakeActivation } = dependencies;
    const activation = await measureOptional(
      timingRecorder,
      "wake activation",
      () =>
        wakeActivation.waitForWake({
          wakePhrases: dependencies.turnConfig.wakePhrases,
        }),
    );

    logWakeDetected(io);

    return runPostWakeVoiceCommand(dependencies, io, {
      ...(activation.phrase ? { wakePhrase: activation.phrase } : {}),
      ...(timingRecorder ? { timingRecorder } : {}),
    });
  }

  const wakeAudio = await measureOptional(
    timingRecorder,
    "wake audio capture",
    () => dependencies.wakeAudioInput.capture(),
  );
  const wakeTranscript = await measureOptional(
    timingRecorder,
    "wake speech-to-text",
    () => dependencies.speechToText.transcribe(wakeAudio),
  );
  const detection = await measureOptional(
    timingRecorder,
    "wake word detection",
    () =>
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
      ...(timingRecorder ? { timings: timingRecorder.snapshot() } : {}),
      transcript: wakeTranscript.text,
    };
  }

  logWakeDetected(io);

  return runPostWakeVoiceCommand(dependencies, io, {
    ...(detection.phrase ? { wakePhrase: detection.phrase } : {}),
    ...(timingRecorder ? { timingRecorder } : {}),
  });
}

async function runPostWakeVoiceCommand(
  dependencies: VoiceActivationDependencies,
  io: VoiceRuntimeIo,
  metadata: { timingRecorder?: VoiceTimingRecorder; wakePhrase?: string } = {},
): Promise<VoiceActivationResult> {
  try {
    const commandTranscript = await transcribeCommand(
      dependencies,
      io,
      metadata.timingRecorder,
    );

    return await runDetectedVoiceCommand(
      dependencies,
      commandTranscript.text,
      io,
      metadata,
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
      ...(metadata.timingRecorder
        ? { timings: metadata.timingRecorder.snapshot() }
        : {}),
      ...(metadata.wakePhrase ? { wakePhrase: metadata.wakePhrase } : {}),
    };
  }
}

async function transcribeCommand(
  dependencies: VoiceActivationDependencies,
  io: VoiceRuntimeIo,
  timingRecorder: VoiceTimingRecorder | undefined,
): Promise<{ text: string }> {
  if (dependencies.streamingAudioInput && dependencies.streamingSpeechToText) {
    const { streamingAudioInput, streamingSpeechToText } = dependencies;
    const audio = await measureOptional(
      timingRecorder,
      "command stream setup",
      () => streamingAudioInput.captureStream(),
    );

    return measureOptional(timingRecorder, "command transcription", () =>
      streamingSpeechToText.transcribeStream(audio, {
        onTranscriptDelta: (delta) => {
          io.progressOutput?.write(delta);
        },
      }),
    );
  }

  const commandAudio = await measureOptional(
    timingRecorder,
    "command audio capture",
    () => dependencies.commandAudioInput.capture(),
  );

  return measureOptional(timingRecorder, "command speech-to-text", () =>
    dependencies.speechToText.transcribe(commandAudio),
  );
}

async function measureOptional<T>(
  timingRecorder: VoiceTimingRecorder | undefined,
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!timingRecorder) {
    return operation();
  }

  return timingRecorder.measure(name, operation);
}
