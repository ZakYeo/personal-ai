import { spawn } from "node:child_process";
import type { VoiceCommandConfig } from "../../ports/assistant.js";
import type {
  CapturedAudioStream,
  StreamingAudioInputPort,
  StreamingAudioOutputPort,
} from "../../ports/voice.js";
import { CommandExecutionError, CommandSpawnError } from "./process-runner.js";

export class CommandStreamingAudioInput implements StreamingAudioInputPort {
  constructor(private readonly commandConfig: VoiceCommandConfig) {}

  captureStream(): Promise<CapturedAudioStream> {
    const child = spawn(
      this.commandConfig.command,
      this.commandConfig.args ?? [],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const stderrChunks: Buffer[] = [];
    const stdoutChunks: Buffer[] = [];
    let spawnError: unknown;

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on("error", (error) => {
      spawnError = error;
    });

    return Promise.resolve({
      chunks: readProcessStdout(
        child,
        stdoutChunks,
        stderrChunks,
        () => spawnError,
      ),
    });
  }
}

export class CommandStreamingAudioOutput implements StreamingAudioOutputPort {
  constructor(private readonly commandConfig: VoiceCommandConfig) {}

  async playStream(chunks: AsyncIterable<Uint8Array>): Promise<void> {
    const child = spawn(
      this.commandConfig.command,
      this.commandConfig.args ?? [],
      {
        stdio: ["pipe", "ignore", "pipe"],
      },
    );

    const stderrChunks: Buffer[] = [];
    let spawnError: unknown;

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on("error", (error) => {
      spawnError = error;
    });

    for await (const chunk of chunks) {
      child.stdin.write(chunk);
    }
    child.stdin.end();

    await waitForProcessClose(
      child,
      [],
      stderrChunks,
      () => spawnError,
      this.commandConfig.command,
    );
  }
}

async function* readProcessStdout(
  child: ReturnType<typeof spawn>,
  stdoutChunks: Buffer[],
  stderrChunks: Buffer[],
  getSpawnError: () => unknown,
): AsyncIterable<Uint8Array> {
  if (!child.stdout) {
    throw new Error("Streaming audio input command did not provide stdout.");
  }

  for await (const chunk of child.stdout) {
    const buffer = Buffer.from(chunk as Buffer);
    stdoutChunks.push(buffer);
    yield buffer;
  }

  await waitForProcessClose(
    child,
    stdoutChunks,
    stderrChunks,
    getSpawnError,
    child.spawnfile,
  );
}

function waitForProcessClose(
  child: ReturnType<typeof spawn>,
  stdoutChunks: Buffer[],
  stderrChunks: Buffer[],
  getSpawnError: () => unknown,
  command: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      const spawnError = getSpawnError();

      if (spawnError) {
        reject(
          new CommandSpawnError(
            `Command "${command}" failed to start.`,
            spawnError,
            stderr,
            stdout,
          ),
        );
        return;
      }

      if (code !== 0) {
        reject(
          new CommandExecutionError(
            `Command "${command}" exited with code ${code ?? "null"}.`,
            code,
            stderr,
            stdout,
          ),
        );
        return;
      }

      resolve();
    });
  });
}
