import type { Assistant } from "../../core/assistant/index.js";
import type { AudioOutputPort, TextToSpeechPort } from "../../ports/voice.js";
import { logVoiceProgress } from "./voice-progress.js";
import { handleAssistantText, speakResponse } from "./voice-response.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";
import type { VoiceTurnResult } from "./voice-turn-result.js";

interface VoiceCommandDependencies {
  assistant: Assistant;
  audioOutput: AudioOutputPort;
  textToSpeech: TextToSpeechPort;
}

export async function runDetectedVoiceCommand(
  dependencies: VoiceCommandDependencies,
  commandText: string,
  io: VoiceRuntimeIo,
  metadata: { wakePhrase?: string } = {},
): Promise<VoiceTurnResult> {
  logVoiceProgress(io, `Heard: ${commandText}`);

  const response = await handleAssistantText(
    dependencies.assistant,
    commandText,
    io,
  );

  logVoiceProgress(io, `Assistant: ${response.text}`);

  const speechOutput = await speakResponse(dependencies, response, io);

  return {
    response,
    ...speechOutput,
    transcript: commandText,
    ...(metadata.wakePhrase ? { wakePhrase: metadata.wakePhrase } : {}),
  };
}
