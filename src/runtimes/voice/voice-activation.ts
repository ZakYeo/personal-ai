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
import { runDetectedVoiceCommand } from "./voice-command.js";
import { logWakeDetected, logWakeListening } from "./voice-progress.js";
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
  logWakeListening(io, dependencies.turnConfig.wakePhrases);

  if (dependencies.wakeActivation) {
    const activation = await dependencies.wakeActivation.waitForWake({
      wakePhrases: dependencies.turnConfig.wakePhrases,
    });

    logWakeDetected(io);

    const commandTranscript = await transcribeCommand(dependencies, io);

    return runDetectedVoiceCommand(
      dependencies,
      commandTranscript.text,
      io,
      activation.phrase ? { wakePhrase: activation.phrase } : {},
    );
  }

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

  const commandTranscript = await transcribeCommand(dependencies, io);

  return runDetectedVoiceCommand(
    dependencies,
    commandTranscript.text,
    io,
    detection.phrase ? { wakePhrase: detection.phrase } : {},
  );
}

async function transcribeCommand(
  dependencies: VoiceActivationDependencies,
  io: VoiceRuntimeIo,
): Promise<{ text: string }> {
  if (dependencies.streamingAudioInput && dependencies.streamingSpeechToText) {
    const audio = await dependencies.streamingAudioInput.captureStream();

    return dependencies.streamingSpeechToText.transcribeStream(audio, {
      onTranscriptDelta: (delta) => {
        io.progressOutput?.write(delta);
      },
    });
  }

  const commandAudio = await dependencies.commandAudioInput.capture();

  return dependencies.speechToText.transcribe(commandAudio);
}
