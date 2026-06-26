import type {
  AudioInputPort,
  AudioOutputPort,
  CapturedAudio,
  SpeechToTextPort,
  SynthesizedSpeech,
  TextToSpeechPort,
  WakeWordDetection,
  WakeWordPort,
  WakeWordRequest,
} from "../../ports/voice.js";

interface VoiceOutputWriter {
  write(chunk: string): boolean | void;
}

export class MockAudioInput implements AudioInputPort {
  constructor(private readonly utterance: string) {}

  capture(): Promise<CapturedAudio> {
    return Promise.resolve({ text: this.utterance });
  }
}

export class MockWakeWordDetector implements WakeWordPort {
  detect(request: WakeWordRequest): Promise<WakeWordDetection> {
    const normalizedAudio = normalizeVoiceText(request.audio.text);
    const phrase = request.wakePhrases.find((candidate) =>
      normalizedAudio.startsWith(normalizeVoiceText(candidate)),
    );

    if (!phrase) {
      return Promise.resolve({ detected: false });
    }

    return Promise.resolve({ detected: true, phrase });
  }
}

export class MockSpeechToText implements SpeechToTextPort {
  transcribe(audio: CapturedAudio): Promise<{ text: string }> {
    return Promise.resolve({ text: audio.text });
  }
}

export class MockTextToSpeech implements TextToSpeechPort {
  synthesize(text: string): Promise<SynthesizedSpeech> {
    return Promise.resolve({ text });
  }
}

export class MockAudioOutput implements AudioOutputPort {
  readonly played: SynthesizedSpeech[] = [];

  constructor(private readonly writer?: VoiceOutputWriter) {}

  play(speech: SynthesizedSpeech): Promise<void> {
    this.played.push(speech);
    this.writer?.write(`${speech.text}\n`);

    return Promise.resolve();
  }
}

function normalizeVoiceText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/gu, " ");
}
