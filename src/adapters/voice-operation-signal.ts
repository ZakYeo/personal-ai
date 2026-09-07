import type { VoiceOperationOptions } from "../ports/voice.js";

export function resolveVoiceOperationSignal(
  shutdown: AbortSignal | undefined,
  operation: VoiceOperationOptions = {},
): AbortSignal | undefined {
  const signal =
    shutdown && operation.signal
      ? AbortSignal.any([shutdown, operation.signal])
      : (operation.signal ?? shutdown);
  signal?.throwIfAborted();
  return signal;
}
