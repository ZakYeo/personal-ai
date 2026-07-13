import type {
  CapturedAudioStream,
  SpeechTranscript,
  StreamingSpeechToTextEvents,
  StreamingSpeechToTextPort,
} from "../../ports/voice.js";
import { streamAudioToSocket } from "./openai-realtime-transcription-audio.js";
import {
  createAudioCommitMessage,
  createRealtimeTranscriptionUrl,
  createTranscriptionSessionUpdateMessage,
  type OpenAIRealtimeTranscriptionConfig,
} from "./openai-realtime-transcription-request.js";
import {
  OpenAIRealtimeTranscriptionSession,
  type RealtimeSocketFactory,
} from "./openai-realtime-transcription-session.js";
import { resolveOpenAIApiKey } from "./openai-client.js";

export type {
  RealtimeSocket,
  RealtimeSocketFactory,
} from "./openai-realtime-transcription-session.js";

interface OpenAIRealtimeTranscriptionOptions {
  config: OpenAIRealtimeTranscriptionConfig;
  env: Record<string, string | undefined>;
  shutdownSignal?: AbortSignal;
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
    const session = new OpenAIRealtimeTranscriptionSession(
      socket,
      events,
      this.options.config.timeoutMs,
      this.options.shutdownSignal,
    );
    let primaryError: Error | undefined;

    try {
      await session.waitForOpen();
      socket.send(createTranscriptionSessionUpdateMessage(this.options.config));

      await streamAudioToSocket(socket, audio.chunks, session.transcript);

      socket.send(createAudioCommitMessage());

      const transcript = await session.transcript;

      return transcript;
    } catch (error) {
      primaryError = toError(error);
      throw primaryError;
    } finally {
      session.dispose(primaryError);
    }
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
