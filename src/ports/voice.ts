export interface CapturedAudio {
  filePath?: string;
  text: string;
}

export interface CapturedAudioStream {
  chunks: AsyncIterable<Uint8Array>;
  cleanup?(): Promise<void>;
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

export interface SynthesizedSpeechStream {
  chunks: AsyncIterable<Uint8Array>;
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

export interface StreamingAudioInputPort {
  captureStream(): Promise<CapturedAudioStream>;
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

export interface StreamingSpeechToTextEvents {
  onTranscriptDelta?(delta: string): void;
}

export interface StreamingSpeechToTextPort {
  transcribeStream(
    audio: CapturedAudioStream,
    events?: StreamingSpeechToTextEvents,
  ): Promise<SpeechTranscript>;
}

export interface TextToSpeechPort {
  synthesize(text: string): Promise<SynthesizedSpeech>;
}

export interface StreamingTextToSpeechPort {
  synthesizeStream(text: string): Promise<SynthesizedSpeechStream>;
}

export interface AudioOutputPort {
  play(speech: SynthesizedSpeech): Promise<void>;
}

export interface StreamingAudioOutputPort {
  playStream(chunks: AsyncIterable<Uint8Array>): Promise<void>;
}
