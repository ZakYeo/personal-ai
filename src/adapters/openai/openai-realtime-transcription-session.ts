import type {
  SpeechTranscript,
  StreamingSpeechToTextEvents,
} from "../../ports/voice.js";
import { createOpenAIVoiceProviderError } from "./openai-voice-provider-error.js";
import { parseRealtimeTranscriptionEvent } from "./openai-realtime-transcription-events.js";

type RealtimeSocketListener = (event?: unknown) => void;

export interface RealtimeSocket {
  addEventListener(type: string, listener: RealtimeSocketListener): void;
  close(): void;
  removeEventListener(type: string, listener: RealtimeSocketListener): void;
  send(message: string): void;
}

export interface RealtimeSocketFactoryRequest {
  apiKey: string;
  url: string;
}

export type RealtimeSocketFactory = (
  request: RealtimeSocketFactoryRequest,
) => RealtimeSocket;

export class OpenAIRealtimeTranscriptionSession {
  readonly transcript: Promise<SpeechTranscript>;
  private readonly failure: Promise<never>;
  private readonly listeners: Array<{
    listener: RealtimeSocketListener;
    type: string;
  }> = [];
  private readonly opened: Promise<void>;
  private rejectFailure: (error: Error) => void = () => {};
  private disposed = false;
  private readonly timer: ReturnType<typeof setTimeout>;

  constructor(
    private readonly socket: RealtimeSocket,
    events: StreamingSpeechToTextEvents,
    private readonly timeoutMs: number,
    private readonly shutdownSignal?: AbortSignal,
  ) {
    let resolveOpen: () => void = () => {};
    let resolveTranscript: (transcript: SpeechTranscript) => void = () => {};
    let text = "";

    this.opened = new Promise<void>((resolve) => {
      resolveOpen = resolve;
    });
    const completed = new Promise<SpeechTranscript>((resolve) => {
      resolveTranscript = resolve;
    });
    this.failure = new Promise<never>((_resolve, reject) => {
      this.rejectFailure = reject;
    });
    void this.failure.catch(() => {});
    this.transcript = Promise.race([completed, this.failure]);
    void this.transcript.catch(() => {});

    this.listen("open", () => resolveOpen());
    this.listen("error", (event) =>
      this.fail(createRealtimeSocketError(event)),
    );
    this.listen("close", (event) => {
      if (!this.disposed) {
        this.fail(createRealtimeSocketClosedError(event));
      }
    });
    this.listen("message", (messageEvent) => {
      try {
        const event = parseRealtimeTranscriptionEvent(messageEvent);

        if (event.type === "error") {
          this.fail(
            createOpenAIVoiceProviderError({
              event: event.event,
              message: "Realtime transcription failed.",
            }),
          );
          return;
        }

        if (
          event.type === "conversation.item.input_audio_transcription.delta"
        ) {
          text += event.delta;
          events.onTranscriptDelta?.(event.delta);
          return;
        }

        if (
          event.type === "conversation.item.input_audio_transcription.completed"
        ) {
          resolveTranscript({ text: event.transcript ?? text });
        }
      } catch (error) {
        this.fail(
          createOpenAIVoiceProviderError({
            cause: error,
            event: messageEvent,
            message: "Realtime transcription message was invalid.",
          }),
        );
      }
    });

    this.timer = setTimeout(() => {
      this.fail(createRealtimeTimeoutError(this.timeoutMs));
    }, this.timeoutMs);

    if (this.shutdownSignal?.aborted) {
      this.onAbort();
    } else {
      this.shutdownSignal?.addEventListener("abort", this.onAbort, {
        once: true,
      });
    }
  }

  waitForOpen(): Promise<void> {
    return Promise.race([this.opened, this.failure]);
  }

  dispose(primaryError?: Error): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    if (primaryError) {
      this.rejectFailure(primaryError);
    }
    this.removeListeners();

    try {
      this.socket.close();
    } catch (error) {
      if (!primaryError) {
        throw toError(error);
      }

      attachSecondaryCause(primaryError, error);
    }
  }

  private readonly onAbort = (): void => {
    this.fail(createRealtimeAbortError(this.shutdownSignal));
  };

  private fail(error: Error): void {
    if (this.disposed) {
      return;
    }

    this.rejectFailure(error);
    this.removeListeners();
  }

  private listen(type: string, listener: RealtimeSocketListener): void {
    this.listeners.push({ listener, type });
    this.socket.addEventListener(type, listener);
  }

  private removeListeners(): void {
    clearTimeout(this.timer);
    this.shutdownSignal?.removeEventListener("abort", this.onAbort);

    for (const { listener, type } of this.listeners.splice(0)) {
      this.socket.removeEventListener(type, listener);
    }
  }
}

function createRealtimeSocketError(event: unknown): Error {
  return createOpenAIVoiceProviderError({
    event,
    message: "Realtime transcription socket failed.",
  });
}

function createRealtimeSocketClosedError(event: unknown): Error {
  return createOpenAIVoiceProviderError({
    event,
    message: "Realtime transcription socket closed unexpectedly.",
  });
}

function createRealtimeTimeoutError(timeoutMs: number): Error {
  return new Error(`Realtime transcription timed out after ${timeoutMs}ms.`);
}

function createRealtimeAbortError(signal: AbortSignal | undefined): Error {
  return createOpenAIVoiceProviderError({
    cause: signal?.reason as unknown,
    message: "Realtime transcription was aborted.",
  });
}

function attachSecondaryCause(
  primaryError: Error,
  secondaryError: unknown,
): void {
  const existingCause = primaryError.cause;
  const cause =
    existingCause === undefined
      ? secondaryError
      : new AggregateError(
          [existingCause, secondaryError],
          "Realtime transcription and cleanup both failed.",
        );

  Object.defineProperty(primaryError, "cause", {
    configurable: true,
    value: cause,
  });
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
