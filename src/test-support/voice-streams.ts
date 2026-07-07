export async function* chunksFromText(text: string): AsyncIterable<Uint8Array> {
  await Promise.resolve();
  yield Buffer.from(text, "utf8");
}

export async function readChunksAsText(
  chunks: AsyncIterable<Uint8Array>,
): Promise<string> {
  const buffers: Buffer[] = [];

  for await (const chunk of chunks) {
    buffers.push(Buffer.from(chunk));
  }

  return Buffer.concat(buffers).toString("utf8");
}
