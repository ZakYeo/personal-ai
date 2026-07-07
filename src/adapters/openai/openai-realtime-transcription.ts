import type {
  CapturedAudioStream,
  SpeechTranscript,
  StreamingSpeechToTextEvents,
  StreamingSpeechToTextPort,
} from "../../ports/voice.js";
import { resolveOpenAIApiKey } from "./openai-voice-client.js";

interface OpenAIRealtimeTranscriptionConfig {
  apiKeyEnv: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

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

interface OpenAIRealtimeTranscriptionOptions {
  config: OpenAIRealtimeTranscriptionConfig;
  env: Record<string, string | undefined>;
  webSocketFactory: RealtimeSocketFactory;
}

export class OpenAIRealtimeTranscription implements StreamingSpeechToTextPort {
  constructor(private readonly options: OpenAIRealtimeTranscriptionOptions) {}

  async transcribeStream(
    audio: CapturedAudioStream,
    events: StreamingSpeechToTextEvents = {},
  ): Promise<SpeechTranscript> {
    const apiKey = resolveOpenAIApiKey(this.options.config, this.options.env);

    const socket = this.options.webSocketFactory({
      apiKey,
      url: createRealtimeTranscriptionUrl(this.options.config),
    });

    try {
      await waitForSocketOpen(socket, this.options.config.timeoutMs);
      configureTranscriptionSession(socket, this.options.config);

      let transcriptFailure: unknown;
      const transcriptPromise = waitForTranscript(
        socket,
        events,
        this.options.config.timeoutMs,
      ).catch((error: unknown) => {
        transcriptFailure = error;
        return;
      });

      for await (const chunk of audio.chunks) {
        socket.send(
          JSON.stringify({
            audio: Buffer.from(chunk).toString("base64"),
            type: "input_audio_buffer.append",
          }),
        );
      }

      socket.send(JSON.stringify({ type: "input_audio_buffer.commit" }));

      const transcript = await transcriptPromise;
      if (transcriptFailure !== undefined) {
        throw toError(transcriptFailure);
      }
      if (!transcript) {
        throw new Error("Realtime transcription did not return a transcript.");
      }

      return transcript;
    } finally {
      socket.close();
    }
  }
}

function configureTranscriptionSession(
  socket: RealtimeSocket,
  config: OpenAIRealtimeTranscriptionConfig,
): void {
  socket.send(
    JSON.stringify({
      session: {
        input_audio_format: "pcm16",
        input_audio_transcription: {
          model: config.model,
        },
        turn_detection: null,
        type: "transcription",
      },
      type: "transcription_session.update",
    }),
  );
}

function createRealtimeTranscriptionUrl(
  config: OpenAIRealtimeTranscriptionConfig,
): string {
  const url = new URL(config.baseUrl);
  url.searchParams.set("intent", "transcription");
  url.searchParams.set("model", config.model);

  return url.toString();
}

function waitForSocketOpen(
  socket: RealtimeSocket,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(createRealtimeTimeoutError(timeoutMs));
    }, timeoutMs);

    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Realtime transcription socket failed."));
    });
  });
}

function waitForTranscript(
  socket: RealtimeSocket,
  events: StreamingSpeechToTextEvents,
  timeoutMs: number,
): Promise<SpeechTranscript> {
  let text = "";

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(createRealtimeTimeoutError(timeoutMs));
    }, timeoutMs);

    socket.addEventListener("message", (messageEvent) => {
      try {
        const event = parseRealtimeEvent(messageEvent);

        if (event.type === "error") {
          clearTimeout(timer);
          reject(new Error("Realtime transcription failed."));
          return;
        }

        if (
          event.type === "conversation.item.input_audio_transcription.delta"
        ) {
          const delta = parseStringField(event, "delta");
          text += delta;
          events.onTranscriptDelta?.(delta);
          return;
        }

        if (
          event.type === "conversation.item.input_audio_transcription.completed"
        ) {
          clearTimeout(timer);
          resolve({
            text: parseOptionalStringField(event, "transcript") ?? text,
          });
        }
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Realtime transcription socket failed."));
    });
  });
}

function createRealtimeTimeoutError(timeoutMs: number): Error {
  return new Error(`Realtime transcription timed out after ${timeoutMs}ms.`);
}

function parseRealtimeEvent(messageEvent: unknown): Record<string, unknown> {
  if (!isRecord(messageEvent) || typeof messageEvent.data !== "string") {
    throw new Error("Realtime transcription event must include string data.");
  }

  const parsed = JSON.parse(messageEvent.data) as unknown;

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    throw new Error("Realtime transcription event type must be a string.");
  }

  return parsed;
}

function parseStringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];

  if (typeof field !== "string") {
    throw new Error(`Realtime transcription event ${key} must be a string.`);
  }

  return field;
}

function parseOptionalStringField(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const field = value[key];

  if (field === undefined) {
    return undefined;
  }

  if (typeof field !== "string") {
    throw new Error(`Realtime transcription event ${key} must be a string.`);
  }

  return field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
