const maximumReaderCancellationWaitMs = 1_000;

export async function cancelReaderBestEffort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options: { reason?: unknown; waitMs?: number } = {},
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waitMs = Math.min(
    options.waitMs ?? maximumReaderCancellationWaitMs,
    maximumReaderCancellationWaitMs,
  );

  try {
    await Promise.race([
      reader.cancel(options.reason).catch(() => {}),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, waitMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
