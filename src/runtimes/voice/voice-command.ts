import type { Assistant } from "../../core/assistant/index.js";
import type { AudioOutputPort, TextToSpeechPort } from "../../ports/voice.js";
import {
  logAssistantResponse,
  logCommandTranscript,
} from "./voice-progress.js";
import { handleAssistantText, speakResponse } from "./voice-response.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";
import {
  createVoiceTurnInstrumentation,
  type VoiceTurnInstrumentation,
} from "./voice-timings.js";
import type { VoiceTurnResult } from "./voice-turn-result.js";
import type { StreamingVoiceOutput } from "./streaming-voice.js";

export interface VoiceCommandDependencies {
  assistant: Assistant;
  audioOutput: AudioOutputPort;
  streamingOutput?: StreamingVoiceOutput;
  textToSpeech: TextToSpeechPort;
}

export async function runDetectedVoiceCommand(
  dependencies: VoiceCommandDependencies,
  commandText: string,
  io: VoiceRuntimeIo,
  metadata: {
    instrumentation?: VoiceTurnInstrumentation;
    wakePhrase?: string;
  } = {},
): Promise<VoiceTurnResult> {
  const instrumentation =
    metadata.instrumentation ?? createVoiceTurnInstrumentation();

  logCommandTranscript(io, commandText);

  const response = await instrumentation.measure("assistant handling", () =>
    handleAssistantText(dependencies.assistant, commandText, io),
  );

  logAssistantResponse(io, response);

  const speechOutput = await instrumentation.measure("speech output", () =>
    speakResponse(dependencies, response, io),
  );
  const timings = instrumentation.snapshotIfEnabled();

  return {
    response,
    ...speechOutput,
    ...(timings ? { timings } : {}),
    transcript: commandText,
    ...(metadata.wakePhrase ? { wakePhrase: metadata.wakePhrase } : {}),
  };
}
