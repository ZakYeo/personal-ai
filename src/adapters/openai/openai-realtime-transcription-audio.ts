import type { SpeechTranscript } from "../../ports/voice.js";
import { cleanupAsyncIteratorWithinDeadline } from "../async-iterator-cleanup.js";
import type { RealtimeSocket } from "./openai-realtime-transcription-session.js";
import { createAudioAppendMessage } from "./openai-realtime-transcription-request.js";
import {
  maximumRealtimeAudioBytes,
  maximumRealtimeAudioChunkBytes,
  realtimeIteratorCleanupDeadlineMs,
} from "./openai-realtime-limits.js";

export async function streamAudioToSocket(
  socket: RealtimeSocket,
  chunks: AsyncIterable<Uint8Array>,
  transcriptPromise: Promise<SpeechTranscript>,
): Promise<void> {
  const iterator = chunks[Symbol.asyncIterator]();
  let audioBytes = 0;

  try {
    while (true) {
      const next = await nextAudioChunkOrTranscriptFailure(
        iterator,
        transcriptPromise,
      );

      if (next.done) {
        return;
      }

      if (next.value.byteLength > maximumRealtimeAudioChunkBytes) {
        throw new Error(
          `Realtime audio chunk exceeded ${maximumRealtimeAudioChunkBytes} bytes.`,
        );
      }

      audioBytes += next.value.byteLength;
      if (audioBytes > maximumRealtimeAudioBytes) {
        throw new Error(
          `Realtime audio exceeded ${maximumRealtimeAudioBytes} bytes.`,
        );
      }

      await socket.send(createAudioAppendMessage(next.value));
    }
  } catch (error) {
    const primaryError = toError(error);

    const cleanupError = await cleanupAsyncIteratorWithinDeadline(iterator, {
      label: "Realtime audio",
      timeoutMs: realtimeIteratorCleanupDeadlineMs,
    });
    if (cleanupError) {
      attachSecondaryCause(primaryError, cleanupError);
    }

    throw primaryError;
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
          "Audio streaming and iterator cleanup both failed.",
        );

  Object.defineProperty(primaryError, "cause", {
    configurable: true,
    value: cause,
  });
}
