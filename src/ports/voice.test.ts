import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
  StreamingAudioInputPort,
  StreamingAudioOutputPort,
  StreamingSpeechToTextPort,
  TextToSpeechPort,
  WakeWordPort,
} from "./voice.js";

describe("voice ports", () => {
  it("supports deterministic voice adapter implementations", async () => {
    const audioInput: AudioInputPort = {
      capture: () => Promise.resolve({ text: "Hey Jarvis, list my alarms" }),
    };
    const wakeWord: WakeWordPort = {
      detect: ({ audio, wakePhrases }) => {
        const phrase = wakePhrases[0] ?? "";

        return Promise.resolve({
          detected: audio.text.toLowerCase().startsWith(phrase),
          phrase,
        });
      },
    };
    const speechToText: SpeechToTextPort = {
      transcribe: (audio) => Promise.resolve({ text: audio.text }),
    };
    const textToSpeech: TextToSpeechPort = {
      synthesize: (text) => Promise.resolve({ text }),
    };
    const spoken: string[] = [];
    const audioOutput: AudioOutputPort = {
      play: (speech) => {
        spoken.push(speech.text);
        return Promise.resolve();
      },
    };

    const audio = await audioInput.capture();
    const detection = await wakeWord.detect({
      audio,
      wakePhrases: ["hey jarvis"],
    });
    const transcript = await speechToText.transcribe(audio);
    const speech = await textToSpeech.synthesize(transcript.text);
    await audioOutput.play(speech);

    expect(detection).toEqual({ detected: true, phrase: "hey jarvis" });
    expect(spoken).toEqual(["Hey Jarvis, list my alarms"]);
  });

  it("supports streaming audio adapter implementations", async () => {
    const streamingInput: StreamingAudioInputPort = {
      captureStream: () =>
        Promise.resolve({
          chunks: chunksFromText("audio"),
        }),
    };
    const played: string[] = [];
    const streamingSpeechToText: StreamingSpeechToTextPort = {
      transcribeStream: async (audio, events) => {
        const text = await readChunksAsText(audio.chunks);
        events?.onTranscriptDelta?.(text);

        return { text };
      },
    };
    const streamingOutput: StreamingAudioOutputPort = {
      playStream: async (chunks) => {
        played.push(await readChunksAsText(chunks));
      },
    };

    const audio = await streamingInput.captureStream();
    const transcript = await streamingSpeechToText.transcribeStream(audio, {
      onTranscriptDelta: (delta) => played.push(`delta:${delta}`),
    });
    await streamingOutput.playStream(chunksFromText(transcript.text));

    expect(played).toEqual(["delta:audio", "audio"]);
  });
});

async function* chunksFromText(text: string): AsyncIterable<Uint8Array> {
  await Promise.resolve();
  yield Buffer.from(text, "utf8");
}

async function readChunksAsText(
  chunks: AsyncIterable<Uint8Array>,
): Promise<string> {
  const buffers: Buffer[] = [];

  for await (const chunk of chunks) {
    buffers.push(Buffer.from(chunk));
  }

  return Buffer.concat(buffers).toString("utf8");
}
