import type { VoiceCommandConfig } from "../../ports/assistant.js";
import type {
  CapturedAudioStream,
  StreamingAudioInputPort,
  StreamingAudioOutputPort,
} from "../../ports/voice.js";
import {
  runCommandReadableStream,
  runCommandWritableStream,
} from "./process-runner.js";

export class CommandStreamingAudioInput implements StreamingAudioInputPort {
  constructor(private readonly commandConfig: VoiceCommandConfig) {}

  captureStream(): Promise<CapturedAudioStream> {
    return Promise.resolve(runCommandReadableStream(this.commandConfig));
  }
}

export class CommandStreamingAudioOutput implements StreamingAudioOutputPort {
  constructor(private readonly commandConfig: VoiceCommandConfig) {}

  playStream(chunks: AsyncIterable<Uint8Array>): Promise<void> {
    return runCommandWritableStream(this.commandConfig, chunks);
  }
}
