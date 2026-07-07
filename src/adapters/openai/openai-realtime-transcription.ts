import type {
  CapturedAudioStream,
  SpeechTranscript,
  StreamingSpeechToTextEvents,
  StreamingSpeechToTextPort,
} from "../../ports/voice.js";

interface OpenAIRealtimeTranscriptionConfig {
  apiKeyEnv: string;
  baseUrl: string;
  model: string;
}

interface RealtimeSocket {
  addEventListener(type: string, listener: (event?: unknown) => void): void;
  close(): void;
  send(message: string): void;
}

interface RealtimeSocketFactoryRequest {
  apiKey: string;
  url: string;
}

type RealtimeSocketFactory = (
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
    const apiKey = this.options.env[this.options.config.apiKeyEnv];

    if (!apiKey) {
      throw new Error(
        `OpenAI API key environment variable ${this.options.config.apiKeyEnv} is not set.`,
      );
    }

    const socket = this.options.webSocketFactory({
      apiKey,
      url: createRealtimeTranscriptionUrl(this.options.config),
    });

    await waitForSocketOpen(socket);

    const transcriptPromise = waitForTranscript(socket, events);

    for await (const chunk of audio.chunks) {
      socket.send(
        JSON.stringify({
          audio: Buffer.from(chunk).toString("base64"),
          type: "input_audio_buffer.append",
        }),
      );
    }

    socket.send(JSON.stringify({ type: "input_audio_buffer.commit" }));

    try {
      return await transcriptPromise;
    } finally {
      socket.close();
    }
  }
}

function createRealtimeTranscriptionUrl(
  config: OpenAIRealtimeTranscriptionConfig,
): string {
  const url = new URL(config.baseUrl);
  url.searchParams.set("intent", "transcription");
  url.searchParams.set("model", config.model);

  return url.toString();
}

function waitForSocketOpen(socket: RealtimeSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () =>
      reject(new Error("Realtime transcription socket failed.")),
    );
  });
}

function waitForTranscript(
  socket: RealtimeSocket,
  events: StreamingSpeechToTextEvents,
): Promise<SpeechTranscript> {
  let text = "";

  return new Promise((resolve, reject) => {
    socket.addEventListener("message", (messageEvent) => {
      try {
        const event = parseRealtimeEvent(messageEvent);

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
          resolve({
            text: parseOptionalStringField(event, "transcript") ?? text,
          });
        }
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.addEventListener("error", () =>
      reject(new Error("Realtime transcription socket failed.")),
    );
  });
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
