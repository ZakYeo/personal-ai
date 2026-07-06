import type { Assistant } from "../../core/assistant/index.js";
import type { AudioOutputPort, TextToSpeechPort } from "../../ports/voice.js";
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
  const response = await handleAssistantText(
    dependencies.assistant,
    commandText,
    io,
  );
  const speechOutput = await speakResponse(dependencies, response, io);

  return {
    response,
    ...speechOutput,
    transcript: commandText,
    ...(metadata.wakePhrase ? { wakePhrase: metadata.wakePhrase } : {}),
  };
}
