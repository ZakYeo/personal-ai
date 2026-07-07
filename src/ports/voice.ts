export interface CapturedAudio {
  filePath?: string;
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
  filePath?: string;
  text: string;
}

export interface WakeWordRequest {
  audio: CapturedAudio;
  wakePhrases: string[];
}

export interface WakeActivation {
  phrase?: string;
}

export interface AudioInputPort {
  capture(): Promise<CapturedAudio>;
}

export interface WakeWordPort {
  detect(request: WakeWordRequest): Promise<WakeWordDetection>;
}

export interface WakeActivationPort {
  waitForWake(request: { wakePhrases: string[] }): Promise<WakeActivation>;
}

export interface VoiceTempFilePort {
  createFile(filename: string): Promise<string>;
  cleanup(): Promise<void>;
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
