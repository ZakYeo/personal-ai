import type { SpeechTranscript } from "../../ports/voice.js";
import type { RealtimeSocket } from "./openai-realtime-transcription-session.js";
import { createAudioAppendMessage } from "./openai-realtime-transcription-request.js";

export async function streamAudioToSocket(
  socket: RealtimeSocket,
  chunks: AsyncIterable<Uint8Array>,
  transcriptPromise: Promise<SpeechTranscript>,
): Promise<void> {
  const iterator = chunks[Symbol.asyncIterator]();

  try {
    while (true) {
      const next = await nextAudioChunkOrTranscriptFailure(
        iterator,
        transcriptPromise,
      );

      if (next.done) {
        return;
      }

      socket.send(createAudioAppendMessage(next.value));
    }
  } catch (error) {
    await iterator.return?.();
    throw error;
  }
}

async function nextAudioChunkOrTranscriptFailure(
  iterator: AsyncIterator<Uint8Array>,
  transcriptPromise: Promise<SpeechTranscript>,
): Promise<IteratorResult<Uint8Array>> {
  const next = await Promise.race([
    iterator.next().then(
      (result) => ({ result, type: "chunk" }) as const,
      (error: unknown) => ({ error, type: "failure" }) as const,
    ),
    transcriptPromise.then(
      () => ({ type: "transcript" }) as const,
      (error: unknown) => ({ error, type: "failure" }) as const,
    ),
  ]);

  if (next.type === "failure") {
    throw toError(next.error);
  }

  if (next.type === "transcript") {
    throw new Error(
      "Realtime transcription completed before audio stream finished.",
    );
  }

  return next.result;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
