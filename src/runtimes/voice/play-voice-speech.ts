import type { AudioOutputPort, TextToSpeechPort } from "../../ports/voice.js";
import type { StreamingVoiceOutput } from "./streaming-voice.js";

interface VoiceSpeechAdapters {
  audioOutput: AudioOutputPort;
  textToSpeech: TextToSpeechPort;
  streamingOutput?: StreamingVoiceOutput;
}

export async function playVoiceSpeech(
  adapters: VoiceSpeechAdapters,
  text: string,
  options: { signal?: AbortSignal; onFirstAudioSubmitted?(): void } = {},
): Promise<string> {
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  try {
    signal.throwIfAborted();
    if (adapters.streamingOutput) {
      const speech =
        await adapters.streamingOutput.textToSpeech.synthesizeStream(text, {
          signal,
        });
      signal.throwIfAborted();
      let submitted = false;
      let completed = false;
      async function* observeChunks() {
        for await (const chunk of speech.chunks) {
          signal.throwIfAborted();
          if (chunk.byteLength > 0 && !submitted) {
            submitted = true;
            options.onFirstAudioSubmitted?.();
          }
          yield chunk;
        }
        completed = true;
      }
      await adapters.streamingOutput.audioOutput.playStream(observeChunks(), {
        signal,
      });
      signal.throwIfAborted();
      if (!submitted || !completed)
        throw new Error(
          "Speech playback did not consume a complete non-empty audio stream.",
        );
      return speech.text;
    }
    const speech = await adapters.textToSpeech.synthesize(text, { signal });
    signal.throwIfAborted();
    options.onFirstAudioSubmitted?.();
    await adapters.audioOutput.play(speech, { signal });
    signal.throwIfAborted();
    return speech.text;
  } finally {
    controller.abort(new Error("Speech output session ended."));
  }
}
