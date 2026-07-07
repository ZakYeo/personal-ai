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

  it("starts streaming audio commands when chunks are consumed", async () => {
    const adapter = new CommandStreamingAudioInput(
      createShellCommand("printf lazy"),
    );

    const audio = await adapter.captureStream();
    await new Promise((resolve) => setTimeout(resolve, 10));

    await expect(readChunksAsText(audio.chunks)).resolves.toBe("lazy");
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

  it("applies configured timeouts to streaming commands", async () => {
    const adapter = new CommandStreamingAudioInput({
      ...createShellCommand("sleep 1"),
      timeoutMs: 1,
    });
    const audio = await adapter.captureStream();

    await expect(readChunksAsText(audio.chunks)).rejects.toThrow(
      'Command "/bin/sh" timed out after 1ms.',
    );
  });

  it("can clean up a running streaming audio command before it times out", async () => {
    const adapter = new CommandStreamingAudioInput({
      ...createShellCommand("sleep 10"),
      timeoutMs: 30_000,
    });
    const audio = await adapter.captureStream();

    await expect(audio.cleanup?.()).resolves.toBeUndefined();
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
