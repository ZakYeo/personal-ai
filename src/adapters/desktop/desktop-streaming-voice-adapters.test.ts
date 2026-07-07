import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createShellCommand } from "../../test-support/adapter-contract.js";
import {
  CommandStreamingAudioInput,
  CommandStreamingAudioOutput,
} from "./desktop-streaming-voice-adapters.js";

describe("desktop streaming voice adapters", () => {
  it("captures streaming audio chunks from a configured command", async () => {
    const adapter = new CommandStreamingAudioInput(
      createShellCommand("printf audio"),
    );

    const audio = await adapter.captureStream();

    await expect(readChunksAsText(audio.chunks)).resolves.toBe("audio");
  });

  it("plays streaming audio chunks through a configured command", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-stream-play-"));
    const outputPath = join(directory, "played.raw");
    const adapter = new CommandStreamingAudioOutput(
      createShellCommand(`cat > ${JSON.stringify(outputPath)}`),
    );

    await adapter.playStream(chunksFromText("streamed audio"));

    await expect(readFile(outputPath, "utf8")).resolves.toBe("streamed audio");
  });
});

async function readChunksAsText(
  chunks: AsyncIterable<Uint8Array>,
): Promise<string> {
  const buffers: Buffer[] = [];

  for await (const chunk of chunks) {
    buffers.push(Buffer.from(chunk));
  }

  return Buffer.concat(buffers).toString("utf8");
}

async function* chunksFromText(text: string): AsyncIterable<Uint8Array> {
  await Promise.resolve();
  yield Buffer.from(text, "utf8");
}
