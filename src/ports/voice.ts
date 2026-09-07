export interface VoiceOperationOptions {
  readonly signal?: AbortSignal;
}

export interface CapturedAudio {
  filePath?: string;
  text: string;
}

export interface CapturedAudioStream {
  chunks: AsyncIterable<Uint8Array>;
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
  capture(options?: VoiceOperationOptions): Promise<CapturedAudio>;
}

export interface StreamingAudioInputPort {
  captureStream(options?: VoiceOperationOptions): Promise<CapturedAudioStream>;
}

export interface WakeWordPort {
  detect(
    request: WakeWordRequest,
    options?: VoiceOperationOptions,
  ): Promise<WakeWordDetection>;
}

export interface WakeActivationPort {
  waitForWake(
    request: { wakePhrases: string[] },
    options?: VoiceOperationOptions,
  ): Promise<WakeActivation>;
}

export interface VoiceTempFilePort {
  createFile(filename: string): Promise<string>;
  cleanup(): Promise<void>;
}

export interface SpeechToTextPort {
  transcribe(
    audio: CapturedAudio,
    options?: VoiceOperationOptions,
  ): Promise<SpeechTranscript>;
}

export interface StreamingSpeechToTextEvents {
  onTranscriptDelta?(delta: string): void;
}

export interface StreamingSpeechToTextPort {
  transcribeStream(
    audio: CapturedAudioStream,
    events?: StreamingSpeechToTextEvents,
    options?: VoiceOperationOptions,
  ): Promise<SpeechTranscript>;
}

export interface TextToSpeechPort {
  synthesize(
    text: string,
    options?: VoiceOperationOptions,
  ): Promise<SynthesizedSpeech>;
}

export interface StreamingTextToSpeechPort {
  synthesizeStream(
    text: string,
    options?: VoiceOperationOptions,
  ): Promise<SynthesizedSpeechStream>;
}

export interface AudioOutputPort {
  play(
    speech: SynthesizedSpeech,
    options?: VoiceOperationOptions,
  ): Promise<void>;
}

export interface StreamingAudioOutputPort {
  playStream(
    chunks: AsyncIterable<Uint8Array>,
    options?: VoiceOperationOptions,
  ): Promise<void>;
}
