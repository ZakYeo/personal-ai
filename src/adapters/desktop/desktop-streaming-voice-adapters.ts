import type { DesktopCommandConfig } from "./desktop-command-config.js";
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
    private readonly commandConfig: DesktopCommandConfig,
    private readonly processControl?: ProcessControl,
    private readonly signal?: AbortSignal,
    private readonly environment: Record<string, string | undefined> = {},
  ) {}

  captureStream(): Promise<CapturedAudioStream> {
    return Promise.resolve(
      runCommandReadableStream({
        ...this.commandConfig,
        ...(this.processControl ? { processControl: this.processControl } : {}),
        ...(this.signal ? { signal: this.signal } : {}),
        environment: this.environment,
      }),
    );
  }
}

export class CommandStreamingAudioOutput implements StreamingAudioOutputPort {
  constructor(
    private readonly commandConfig: DesktopCommandConfig,
    private readonly processControl?: ProcessControl,
    private readonly signal?: AbortSignal,
    private readonly environment: Record<string, string | undefined> = {},
  ) {}

  playStream(chunks: AsyncIterable<Uint8Array>): Promise<void> {
    return runCommandWritableStream(
      {
        ...this.commandConfig,
        ...(this.processControl ? { processControl: this.processControl } : {}),
        ...(this.signal ? { signal: this.signal } : {}),
        environment: this.environment,
      },
      chunks,
    );
  }
}
