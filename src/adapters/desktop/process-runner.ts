import { spawn } from "node:child_process";

export interface ProcessControl {
  kill(pid: number, signal: NodeJS.Signals): void;
  platform: string;
}

interface RunCommandRequest {
  args?: string[];
  command: string;
  processControl?: ProcessControl;
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

const nodeProcessControl: ProcessControl = {
  kill: (pid, signal) => process.kill(pid, signal),
  platform: process.platform,
};

export async function runCommand(
  request: RunCommandRequest,
): Promise<RunCommandResult> {
  const commandProcess = startCommandProcess(request, {
    captureStdout: true,
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return commandProcess.waitForSuccess();
}

export function runCommandUntilStdoutLine<TLine>(
  request: RunCommandRequest,
  selectLine: (line: string) => TLine | undefined,
): Promise<RunCommandResult & { line: TLine }> {
  return new Promise((resolve, reject) => {
    let pendingStdout = "";

    const handleStdoutLine = (line: string): void => {
      let selected: TLine | undefined;

      try {
        selected = selectLine(line);
      } catch (error) {
        commandProcess.terminate();
        reject(toError(error));

        return;
      }

      if (selected !== undefined) {
        commandProcess.terminate();
        resolve({ ...commandProcess.output(), line: selected });
      }
    };

    const commandProcess = startCommandProcess(request, {
      captureStdout: true,
      detached: true,
      onStdoutData: (chunk) => {
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
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    commandProcess.waitForSuccess().then(
      () => {
        if (pendingStdout.trim().length > 0) {
          handleStdoutLine(pendingStdout.trim());
        }

        reject(
          new CommandExecutionError(
            `Command "${request.command}" exited without wake activation output.`,
            0,
            commandProcess.output().stderr,
            commandProcess.output().stdout,
          ),
        );
      },
      (error: unknown) => {
        reject(toError(error));
      },
    );
  });
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function runCommandReadableStream(request: RunCommandRequest): {
  chunks: AsyncIterable<Uint8Array>;
} {
  return {
    chunks: createCommandReadableIterable(request),
  };
}

function createCommandReadableIterable(
  request: RunCommandRequest,
): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]: () => createCommandReadableIterator(request),
  };
}

function createCommandReadableIterator(
  request: RunCommandRequest,
): AsyncIterator<Uint8Array> {
  const commandProcess = startCommandProcess(request, {
    captureStdout: false,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdoutIterator =
    readProcessStdout(commandProcess)[Symbol.asyncIterator]();

  return {
    next: () => stdoutIterator.next(),
    return: async () => {
      commandProcess.terminate();

      try {
        await commandProcess.waitForSuccess();
      } catch {
        // Iterator cancellation is best-effort; callers keep the primary failure.
      }

      await stdoutIterator.return?.();

      return { done: true, value: undefined };
    },
  };
}

export async function runCommandWritableStream(
  request: RunCommandRequest,
  chunks: AsyncIterable<Uint8Array>,
): Promise<void> {
  const commandProcess = startCommandProcess(request, {
    captureStdout: false,
    detached: false,
    stdio: ["pipe", "ignore", "pipe"],
  });

  for await (const chunk of chunks) {
    commandProcess.writeStdin(chunk);
  }
  commandProcess.endStdin();

  await commandProcess.waitForSuccess();
}

type CommandStdio = "ignore" | "pipe";

interface CommandProcessOptions {
  captureStdout: boolean;
  detached: boolean;
  onStdoutData?: (chunk: Buffer) => void;
  stdio: [CommandStdio, CommandStdio, CommandStdio];
}

function startCommandProcess(
  request: RunCommandRequest,
  options: CommandProcessOptions,
): CommandProcess {
  return new CommandProcess(request, options);
}

class CommandProcess {
  private readonly child: ReturnType<typeof spawn>;
  private readonly completion: Promise<RunCommandResult>;
  private readonly processControl: ProcessControl;
  private readonly stderrChunks: Buffer[] = [];
  private readonly stdoutChunks: Buffer[] = [];

  constructor(
    private readonly request: RunCommandRequest,
    options: CommandProcessOptions,
  ) {
    this.processControl = request.processControl ?? nodeProcessControl;
    this.child = spawn(request.command, request.args ?? [], {
      detached: options.detached && canUseProcessGroups(this.processControl),
      stdio: options.stdio,
    });

    this.captureOutput(options);
    this.completion = this.waitForClose();
    this.completion.catch(() => {});
  }

  endStdin(): void {
    this.child.stdin?.end();
  }

  output(): RunCommandResult {
    return {
      stderr: Buffer.concat(this.stderrChunks).toString("utf8"),
      stdout: Buffer.concat(this.stdoutChunks).toString("utf8"),
    };
  }

  captureStdoutChunk(chunk: Buffer): void {
    this.stdoutChunks.push(chunk);
  }

  stdout(): NodeJS.ReadableStream {
    if (!this.child.stdout) {
      throw new Error("Command did not provide stdout.");
    }

    return this.child.stdout;
  }

  terminate(): void {
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return;
    }

    terminateProcess(this.child, this.processControl);
  }

  waitForSuccess(): Promise<RunCommandResult> {
    return this.completion;
  }

  writeStdin(chunk: Uint8Array): void {
    if (!this.child.stdin) {
      throw new Error("Command did not provide stdin.");
    }

    this.child.stdin.write(chunk);
  }

  private captureOutput(options: CommandProcessOptions): void {
    if (options.captureStdout) {
      this.child.stdout?.on("data", (chunk: Buffer) => {
        this.stdoutChunks.push(chunk);
        options.onStdoutData?.(chunk);
      });
    }

    this.child.stderr?.on("data", (chunk: Buffer) => {
      this.stderrChunks.push(chunk);
    });
  }

  private waitForClose(): Promise<RunCommandResult> {
    return new Promise((resolve, reject) => {
      const timeoutMs = this.request.timeoutMs ?? defaultTimeoutMs;
      let settled = false;

      const settle = (callback: () => void): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        callback();
      };

      const timer = setTimeout(() => {
        settle(() => {
          this.terminate();
          const output = this.output();

          reject(
            new CommandTimeoutError(
              `Command "${this.request.command}" timed out after ${timeoutMs}ms.`,
              timeoutMs,
              output.stderr,
              output.stdout,
            ),
          );
        });
      }, timeoutMs);

      this.child.on("error", (error) => {
        settle(() => {
          const output = this.output();

          reject(
            new CommandSpawnError(
              `Command "${this.request.command}" failed to start.`,
              error,
              output.stderr,
              output.stdout,
            ),
          );
        });
      });

      this.child.on("close", (code) => {
        settle(() => {
          const output = this.output();

          if (code !== 0) {
            reject(
              new CommandExecutionError(
                `Command "${this.request.command}" exited with code ${code ?? "null"}.`,
                code,
                output.stderr,
                output.stdout,
              ),
            );
            return;
          }

          resolve(output);
        });
      });
    });
  }
}

async function* readProcessStdout(
  commandProcess: CommandProcess,
): AsyncIterable<Uint8Array> {
  for await (const chunk of commandProcess.stdout()) {
    const buffer = Buffer.from(chunk as Buffer);
    commandProcess.captureStdoutChunk(buffer);
    yield buffer;
  }

  await commandProcess.waitForSuccess();
}

function terminateProcess(
  child: ReturnType<typeof spawn>,
  processControl: ProcessControl,
): void {
  if (canUseProcessGroups(processControl) && child.pid !== undefined) {
    try {
      processControl.kill(-child.pid, "SIGTERM");
      return;
    } catch (error) {
      if (!isMissingProcessError(error)) {
        throw error;
      }
    }
  }

  child.kill("SIGTERM");
}

function canUseProcessGroups(processControl: ProcessControl): boolean {
  return processControl.platform !== "win32";
}

function isMissingProcessError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ESRCH"
  );
}
