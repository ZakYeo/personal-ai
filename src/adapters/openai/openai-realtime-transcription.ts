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
  type RealtimeSocketFactory,
  waitForSocketOpen,
  waitForTranscript,
} from "./openai-realtime-transcription-session.js";
import { resolveOpenAIApiKey } from "./openai-voice-client.js";

export type {
  RealtimeSocket,
  RealtimeSocketFactory,
} from "./openai-realtime-transcription-session.js";

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
      socket.send(createTranscriptionSessionUpdateMessage(this.options.config));

      const transcriptPromise = waitForTranscript(
        socket,
        events,
        this.options.config.timeoutMs,
      );

      await streamAudioToSocket(socket, audio.chunks, transcriptPromise);

      socket.send(createAudioCommitMessage());

      const transcript = await transcriptPromise;

      return transcript;
    } finally {
      socket.close();
    }
  }
}
