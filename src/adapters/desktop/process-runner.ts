import { spawn } from "node:child_process";

interface RunCommandRequest {
  args?: string[];
  command: string;
  timeoutMs?: number;
}

interface RunCommandResult {
  stderr: string;
  stdout: string;
}

export class CommandExecutionError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly stderr: string,
    readonly stdout: string,
  ) {
    super(message);
    this.name = "CommandExecutionError";
  }
}

export class CommandTimeoutError extends Error {
  constructor(
    message: string,
    readonly timeoutMs: number,
    readonly stderr: string,
    readonly stdout: string,
  ) {
    super(message);
    this.name = "CommandTimeoutError";
  }
}

const defaultTimeoutMs = 30_000;

export function runCommand(
  request: RunCommandRequest,
): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(request.command, request.args ?? [], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill("SIGTERM");
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      reject(
        new CommandTimeoutError(
          `Command "${request.command}" timed out after ${timeoutMs}ms.`,
          timeoutMs,
          stderr,
          stdout,
        ),
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);

      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");

      if (code !== 0) {
        reject(
          new CommandExecutionError(
            `Command "${request.command}" exited with code ${code ?? "null"}.`,
            code,
            stderr,
            stdout,
          ),
        );
        return;
      }

      resolve({ stderr, stdout });
    });
  });
}
