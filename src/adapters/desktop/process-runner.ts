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

export class CommandSpawnError extends Error {
  constructor(
    message: string,
    readonly cause: unknown,
    readonly stderr: string,
    readonly stdout: string,
  ) {
    super(message);
    this.name = "CommandSpawnError";
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
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");

      reject(
        new CommandSpawnError(
          `Command "${request.command}" failed to start.`,
          error,
          stderr,
          stdout,
        ),
      );
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

export function runCommandUntilStdoutLine<TLine>(
  request: RunCommandRequest,
  selectLine: (line: string) => TLine | undefined,
): Promise<RunCommandResult & { line: TLine }> {
  return new Promise((resolve, reject) => {
    const child = spawn(request.command, request.args ?? [], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
    let settled = false;
    let pendingStdout = "";

    const collectOutput = (): RunCommandResult => ({
      stderr: Buffer.concat(stderrChunks).toString("utf8"),
      stdout: Buffer.concat(stdoutChunks).toString("utf8"),
    });

    const settle = (
      callback: (output: RunCommandResult) => void,
      kill = false,
    ): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);

      if (kill) {
        child.kill("SIGTERM");
      }

      callback(collectOutput());
    };

    const timer = setTimeout(() => {
      settle((output) => {
        reject(
          new CommandTimeoutError(
            `Command "${request.command}" timed out after ${timeoutMs}ms.`,
            timeoutMs,
            output.stderr,
            output.stdout,
          ),
        );
      }, true);
    }, timeoutMs);

    const handleStdoutLine = (line: string): void => {
      let selected: TLine | undefined;

      try {
        selected = selectLine(line);
      } catch (error) {
        settle(() => reject(toError(error)), true);

        return;
      }

      if (selected !== undefined) {
        settle((output) => resolve({ ...output, line: selected }), true);
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      pendingStdout += chunk.toString("utf8");

      let newlineIndex = pendingStdout.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = pendingStdout.slice(0, newlineIndex).trim();
        pendingStdout = pendingStdout.slice(newlineIndex + 1);

        if (line.length > 0) {
          handleStdoutLine(line);
        }

        newlineIndex = pendingStdout.indexOf("\n");
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      settle((output) => {
        reject(
          new CommandSpawnError(
            `Command "${request.command}" failed to start.`,
            error,
            output.stderr,
            output.stdout,
          ),
        );
      });
    });

    child.on("close", (code) => {
      if (pendingStdout.trim().length > 0) {
        handleStdoutLine(pendingStdout.trim());
      }

      settle((output) => {
        reject(
          new CommandExecutionError(
            code === 0
              ? `Command "${request.command}" exited without wake activation output.`
              : `Command "${request.command}" exited with code ${code ?? "null"}.`,
            code,
            output.stderr,
            output.stdout,
          ),
        );
      });
    });
  });
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function runCommandReadableStream(request: RunCommandRequest): {
  chunks: AsyncIterable<Uint8Array>;
  cleanup(): Promise<void>;
} {
  let activeProcess: ReadableStreamProcess | undefined;

  return {
    cleanup: async () => {
      await activeProcess?.cleanup();
    },
    chunks: (async function* () {
      activeProcess = startReadableStreamProcess(request);

      yield* readProcessStdout(activeProcess.completion);
    })(),
  };
}

interface ReadableStreamProcess {
  cleanup(): Promise<void>;
  completion: ProcessCompletionRequest;
}

function startReadableStreamProcess(
  request: RunCommandRequest,
): ReadableStreamProcess {
  const child = spawn(request.command, request.args ?? [], {
    detached: canUseProcessGroups(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
  let spawnError: unknown;

  const completion: ProcessCompletionRequest = {
    child,
    command: request.command,
    getSpawnError: () => spawnError,
    stderrChunks,
    stdoutChunks,
    timeoutMs,
  };
  const waitForClose = waitForProcessClose(completion);
  completion.waitForClose = waitForClose;
  waitForClose.catch(() => {});

  child.stderr.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });
  child.on("error", (error) => {
    spawnError = error;
  });

  return {
    completion,
    cleanup: async () => {
      if (child.exitCode === null && child.signalCode === null) {
        terminateProcess(child);
      }

      try {
        await waitForClose;
      } catch {
        // Stream cleanup is best-effort; callers keep the primary failure.
      }
    },
  };
}

export async function runCommandWritableStream(
  request: RunCommandRequest,
  chunks: AsyncIterable<Uint8Array>,
): Promise<void> {
  const child = spawn(request.command, request.args ?? [], {
    stdio: ["pipe", "ignore", "pipe"],
  });
  const stderrChunks: Buffer[] = [];
  const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
  let spawnError: unknown;

  child.stderr.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });
  child.on("error", (error) => {
    spawnError = error;
  });

  const waitForClose = waitForProcessClose({
    child,
    command: request.command,
    getSpawnError: () => spawnError,
    stderrChunks,
    stdoutChunks: [],
    timeoutMs,
  });
  waitForClose.catch(() => {});

  for await (const chunk of chunks) {
    child.stdin.write(chunk);
  }
  child.stdin.end();

  await waitForClose;
}

interface ProcessCompletionRequest {
  child: ReturnType<typeof spawn>;
  command: string;
  getSpawnError(): unknown;
  stderrChunks: Buffer[];
  stdoutChunks: Buffer[];
  timeoutMs: number;
  waitForClose?: Promise<void>;
}

async function* readProcessStdout(
  request: ProcessCompletionRequest,
): AsyncIterable<Uint8Array> {
  if (!request.child.stdout) {
    throw new Error("Command did not provide stdout.");
  }

  const waitForClose = request.waitForClose ?? waitForProcessClose(request);
  waitForClose.catch(() => {});

  for await (const chunk of request.child.stdout) {
    const buffer = Buffer.from(chunk as Buffer);
    request.stdoutChunks.push(buffer);
    yield buffer;
  }

  await waitForClose;
}

function waitForProcessClose(request: ProcessCompletionRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      terminateProcess(request.child);
      reject(
        new CommandTimeoutError(
          `Command "${request.command}" timed out after ${request.timeoutMs}ms.`,
          request.timeoutMs,
          Buffer.concat(request.stderrChunks).toString("utf8"),
          Buffer.concat(request.stdoutChunks).toString("utf8"),
        ),
      );
    }, request.timeoutMs);

    request.child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(request.stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(request.stderrChunks).toString("utf8");
      const spawnError = request.getSpawnError();

      if (spawnError) {
        reject(
          new CommandSpawnError(
            `Command "${request.command}" failed to start.`,
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
            `Command "${request.command}" exited with code ${code ?? "null"}.`,
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

function terminateProcess(child: ReturnType<typeof spawn>): void {
  if (canUseProcessGroups() && child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGTERM");
      return;
    } catch (error) {
      if (!isMissingProcessError(error)) {
        throw error;
      }
    }
  }

  child.kill("SIGTERM");
}

function canUseProcessGroups(): boolean {
  return process.platform !== "win32";
}

function isMissingProcessError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ESRCH"
  );
}
