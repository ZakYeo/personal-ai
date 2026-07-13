import type {
  StreamingAudioInputPort,
  StreamingAudioOutputPort,
  StreamingSpeechToTextPort,
  StreamingTextToSpeechPort,
} from "../../ports/voice.js";

export interface StreamingVoiceInput {
  audioInput: StreamingAudioInputPort;
  speechToText: StreamingSpeechToTextPort;
}

export interface StreamingVoiceOutput {
  audioOutput: StreamingAudioOutputPort;
  textToSpeech: StreamingTextToSpeechPort;
}
