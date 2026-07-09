import type {
  SpeechTranscript,
  StreamingSpeechToTextEvents,
} from "../../ports/voice.js";
import { createOpenAIVoiceProviderError } from "./openai-voice-provider-error.js";
import { parseRealtimeTranscriptionEvent } from "./openai-realtime-transcription-events.js";

export interface RealtimeSocket {
  addEventListener(type: string, listener: (event?: unknown) => void): void;
  close(): void;
  send(message: string): void;
}

export interface RealtimeSocketFactoryRequest {
  apiKey: string;
  url: string;
}

export type RealtimeSocketFactory = (
  request: RealtimeSocketFactoryRequest,
) => RealtimeSocket;

export function waitForSocketOpen(
  socket: RealtimeSocket,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const settle = createRealtimeSettlement({
      reject,
      resolve,
      timeoutMs,
    });

    socket.addEventListener("open", () => {
      settle.resolve();
    });
    socket.addEventListener("error", (event) => {
      settle.reject(createRealtimeSocketError(event));
    });
  });
}

export function waitForTranscript(
  socket: RealtimeSocket,
  events: StreamingSpeechToTextEvents,
  timeoutMs: number,
): Promise<SpeechTranscript> {
  let text = "";

  return new Promise((resolve, reject) => {
    const settle = createRealtimeSettlement({
      reject,
      resolve,
      timeoutMs,
    });

    socket.addEventListener("message", (messageEvent) => {
      try {
        const event = parseRealtimeTranscriptionEvent(messageEvent);

        if (event.type === "error") {
          settle.reject(
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
          settle.resolve({
            text: event.transcript ?? text,
          });
        }
      } catch (error) {
        settle.reject(
          createOpenAIVoiceProviderError({
            cause: error,
            event: messageEvent,
            message: "Realtime transcription message was invalid.",
          }),
        );
      }
    });
    socket.addEventListener("error", (event) => {
      settle.reject(createRealtimeSocketError(event));
    });
  });
}

function createRealtimeSettlement<T>(options: {
  reject(error: Error): void;
  resolve(value: T): void;
  timeoutMs: number;
}): {
  reject(error: Error): void;
  resolve(value: T): void;
} {
  let settled = false;

  const settle = (complete: () => void): void => {
    if (settled) {
      return;
    }

    settled = true;
    clearTimeout(timer);
    complete();
  };

  const timer = setTimeout(() => {
    settle(() => options.reject(createRealtimeTimeoutError(options.timeoutMs)));
  }, options.timeoutMs);

  return {
    reject: (error) => {
      settle(() => options.reject(error));
    },
    resolve: (value) => {
      settle(() => options.resolve(value));
    },
  };
}

function createRealtimeSocketError(event: unknown): Error {
  return createOpenAIVoiceProviderError({
    event,
    message: "Realtime transcription socket failed.",
  });
}

function createRealtimeTimeoutError(timeoutMs: number): Error {
  return new Error(`Realtime transcription timed out after ${timeoutMs}ms.`);
}
