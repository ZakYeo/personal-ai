export interface OpenAIRealtimeTranscriptionConfig {
  apiKeyEnv: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export function createRealtimeTranscriptionUrl(
  config: OpenAIRealtimeTranscriptionConfig,
): string {
  const url = new URL(config.baseUrl);
  url.searchParams.set("intent", "transcription");

  return url.toString();
}

export function createTranscriptionSessionUpdateMessage(
  config: OpenAIRealtimeTranscriptionConfig,
): string {
  return JSON.stringify({
    session: {
      audio: {
        input: {
          format: {
            rate: 24000,
            type: "audio/pcm",
          },
          transcription: {
            model: config.model,
          },
          turn_detection: null,
        },
      },
      type: "transcription",
    },
    type: "session.update",
  });
}

export function createAudioAppendMessage(chunk: Uint8Array): string {
  return JSON.stringify({
    audio: Buffer.from(chunk).toString("base64"),
    type: "input_audio_buffer.append",
  });
}

export function createAudioCommitMessage(): string {
  return JSON.stringify({ type: "input_audio_buffer.commit" });
}
