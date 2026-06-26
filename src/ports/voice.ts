export interface CapturedAudio {
  text: string;
}

export interface WakeWordDetection {
  detected: boolean;
  phrase?: string;
}

export interface SpeechTranscript {
  text: string;
}

export interface SynthesizedSpeech {
  text: string;
}

export interface WakeWordRequest {
  audio: CapturedAudio;
  wakePhrases: string[];
}

export interface AudioInputPort {
  capture(): Promise<CapturedAudio>;
}

export interface WakeWordPort {
  detect(request: WakeWordRequest): Promise<WakeWordDetection>;
}

export interface SpeechToTextPort {
  transcribe(audio: CapturedAudio): Promise<SpeechTranscript>;
}

export interface TextToSpeechPort {
  synthesize(text: string): Promise<SynthesizedSpeech>;
}

export interface AudioOutputPort {
  play(speech: SynthesizedSpeech): Promise<void>;
}
