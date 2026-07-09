import type { Assistant } from "../../core/assistant/index.js";
import type {
  AudioOutputPort,
  StreamingAudioOutputPort,
  StreamingTextToSpeechPort,
  TextToSpeechPort,
} from "../../ports/voice.js";
import {
  logAssistantResponse,
  logCommandTranscript,
} from "./voice-progress.js";
import { handleAssistantText, speakResponse } from "./voice-response.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";
import type { VoiceTimingRecorder } from "./voice-timings.js";
import type { VoiceTurnResult } from "./voice-turn-result.js";

interface VoiceCommandDependencies {
  assistant: Assistant;
  audioOutput: AudioOutputPort;
  streamingAudioOutput?: StreamingAudioOutputPort;
  streamingTextToSpeech?: StreamingTextToSpeechPort;
  textToSpeech: TextToSpeechPort;
}

export async function runDetectedVoiceCommand(
  dependencies: VoiceCommandDependencies,
  commandText: string,
  io: VoiceRuntimeIo,
  metadata: { timingRecorder?: VoiceTimingRecorder; wakePhrase?: string } = {},
): Promise<VoiceTurnResult> {
  logCommandTranscript(io, commandText);

  const response = await measureOptional(
    metadata.timingRecorder,
    "assistant handling",
    () => handleAssistantText(dependencies.assistant, commandText, io),
  );

  logAssistantResponse(io, response);

  const speechOutput = await measureOptional(
    metadata.timingRecorder,
    "speech output",
    () => speakResponse(dependencies, response, io),
  );

  return {
    response,
    ...speechOutput,
    ...(metadata.timingRecorder
      ? { timings: metadata.timingRecorder.snapshot() }
      : {}),
    transcript: commandText,
    ...(metadata.wakePhrase ? { wakePhrase: metadata.wakePhrase } : {}),
  };
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
