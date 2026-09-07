import type { AudioInputPort, SpeechToTextPort } from "../../ports/voice.js";
import type { PresentationInteraction } from "../presentation/presentation-interaction-coordinator.js";
import type { StreamingVoiceInput } from "./streaming-voice.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";
import type { VoiceTurnInstrumentation } from "./voice-timings.js";

export async function transcribeVoiceCommand(
  dependencies: {
    commandAudioInput: AudioInputPort;
    speechToText: SpeechToTextPort;
    streamingInput?: StreamingVoiceInput;
    shutdownSignal: AbortSignal;
  },
  io: VoiceRuntimeIo,
  instrumentation: VoiceTurnInstrumentation,
  presentationInteraction?: PresentationInteraction,
  shouldPublish: () => boolean = () => true,
): Promise<{ text: string }> {
  let transcript: { text: string };
  if (dependencies.streamingInput) {
    const { audioInput, speechToText } = dependencies.streamingInput;
    const audio = await instrumentation.measure("command stream setup", () =>
      audioInput.captureStream({ signal: dependencies.shutdownSignal }),
    );
    transcript = await instrumentation.measure("command transcription", () =>
      speechToText.transcribeStream(
        { chunks: markStreamEnd(audio.chunks, instrumentation) },
        {
          onTranscriptDelta: (delta) => {
            if (dependencies.shutdownSignal.aborted) return;
            if (delta) instrumentation.mark("first_transcript");
            io.progressOutput?.write(delta);
            if (shouldPublish())
              presentationInteraction?.transcriptDelta(delta);
          },
        },
        { signal: dependencies.shutdownSignal },
      ),
    );
  } else {
    const commandAudio = await instrumentation.measure(
      "command audio capture",
      () =>
        dependencies.commandAudioInput.capture({
          signal: dependencies.shutdownSignal,
        }),
    );
    instrumentation.mark("capture_completed");
    transcript = await instrumentation.measure("command speech-to-text", () =>
      dependencies.speechToText.transcribe(commandAudio, {
        signal: dependencies.shutdownSignal,
      }),
    );
  }
  instrumentation.mark("first_transcript");
  if (!dependencies.shutdownSignal.aborted && shouldPublish())
    presentationInteraction?.transcriptFinal(transcript.text);
  return transcript;
}

async function* markStreamEnd(
  chunks: AsyncIterable<Uint8Array>,
  instrumentation: VoiceTurnInstrumentation,
): AsyncIterable<Uint8Array> {
  yield* chunks;
  instrumentation.mark("capture_completed");
}
