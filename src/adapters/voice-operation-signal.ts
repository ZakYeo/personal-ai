import type { VoiceOperationOptions } from "../ports/voice.js";

export function resolveVoiceOperationSignal(
  shutdown: AbortSignal | undefined,
  operation: VoiceOperationOptions = {},
  createAbortError?: (cause: unknown) => Error,
): AbortSignal | undefined {
  const signal =
    shutdown && operation.signal
      ? AbortSignal.any([shutdown, operation.signal])
      : (operation.signal ?? shutdown);
  if (signal?.aborted && createAbortError)
    throw createAbortError(signal.reason as unknown);
  signal?.throwIfAborted();
  return signal;
}
