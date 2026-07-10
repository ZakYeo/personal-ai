import type { VoiceCommandConfig } from "../../ports/assistant.js";
import type {
  CapturedAudioStream,
  StreamingAudioInputPort,
  StreamingAudioOutputPort,
} from "../../ports/voice.js";
import type { ProcessControl } from "../../ports/process-control.js";
import {
  runCommandReadableStream,
  runCommandWritableStream,
} from "./process-runner.js";

export class CommandStreamingAudioInput implements StreamingAudioInputPort {
  constructor(
    private readonly commandConfig: VoiceCommandConfig,
    private readonly processControl?: ProcessControl,
    private readonly signal?: AbortSignal,
  ) {}

  captureStream(): Promise<CapturedAudioStream> {
    return Promise.resolve(
      runCommandReadableStream({
        ...this.commandConfig,
        ...(this.processControl ? { processControl: this.processControl } : {}),
        ...(this.signal ? { signal: this.signal } : {}),
      }),
    );
  }
}

export class CommandStreamingAudioOutput implements StreamingAudioOutputPort {
  constructor(
    private readonly commandConfig: VoiceCommandConfig,
    private readonly processControl?: ProcessControl,
    private readonly signal?: AbortSignal,
  ) {}

  playStream(chunks: AsyncIterable<Uint8Array>): Promise<void> {
    return runCommandWritableStream(
      {
        ...this.commandConfig,
        ...(this.processControl ? { processControl: this.processControl } : {}),
        ...(this.signal ? { signal: this.signal } : {}),
      },
      chunks,
    );
  }
}
