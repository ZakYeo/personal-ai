import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  TextToSpeechPort,
  WakeWordPort,
} from "../../ports/voice.js";
import type { Assistant } from "../../core/assistant/index.js";
import { runDetectedVoiceCommand } from "./voice-command.js";
import { logWakeDetected, logWakeListening } from "./voice-progress.js";
import type { VoiceRuntimeIo, VoiceTurnConfig } from "./voice-turn.js";
import type { VoiceTurnResult } from "./voice-turn-result.js";

export interface VoiceActivationDependencies {
  assistant: Assistant;
  audioOutput: AudioOutputPort;
  commandAudioInput: AudioInputPort;
  speechToText: SpeechToTextPort;
  textToSpeech: TextToSpeechPort;
  turnConfig: VoiceTurnConfig;
  wakeAudioInput: AudioInputPort;
  wakeWord: WakeWordPort;
}

export type VoiceActivationResult = VoiceTurnResult;

export async function runVoiceActivation(
  dependencies: VoiceActivationDependencies,
  io: VoiceRuntimeIo = {},
): Promise<VoiceActivationResult> {
  logWakeListening(io, dependencies.turnConfig.wakePhrases);

  const wakeAudio = await dependencies.wakeAudioInput.capture();
  const wakeTranscript = await dependencies.speechToText.transcribe(wakeAudio);
  const detection = await dependencies.wakeWord.detect({
    audio: {
      ...wakeAudio,
      text: wakeTranscript.text,
    },
    wakePhrases: dependencies.turnConfig.wakePhrases,
  });

  if (!detection.detected) {
    return {
      response: {
        status: "unknown",
        text: "Wake phrase not detected.",
      },
      status: "ignored",
      textOutputWritten: false,
      transcript: wakeTranscript.text,
    };
  }

  logWakeDetected(io);

  const commandAudio = await dependencies.commandAudioInput.capture();
  const commandTranscript =
    await dependencies.speechToText.transcribe(commandAudio);

  return runDetectedVoiceCommand(
    dependencies,
    commandTranscript.text,
    io,
    detection.phrase ? { wakePhrase: detection.phrase } : {},
  );
}
