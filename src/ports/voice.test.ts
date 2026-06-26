import type {
  AudioInputPort,
  AudioOutputPort,
  SpeechToTextPort,
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
});
