import { spawn } from "node:child_process";
import type { ProcessControl } from "../../ports/process-control.js";

export interface RunCommandRequest {
  args?: string[];
  command: string;
  processControl?: ProcessControl;
  signal?: AbortSignal;
  terminationGraceMs?: number;
  timeoutMs?: number;
}

export interface RunCommandResult {
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
const defaultTerminationGraceMs = 1_000;

const nodeProcessControl: ProcessControl = {
  kill: (pid, signal) => process.kill(pid, signal),
  platform: process.platform,
};

type CommandStdio = "ignore" | "pipe";

interface CommandProcessOptions {
  captureStdout: boolean;
  detached: boolean;
  onStdoutData?: (chunk: Buffer) => void;
  stdio: [CommandStdio, CommandStdio, CommandStdio];
}

export function startCommandProcess(
  request: RunCommandRequest,
  options: CommandProcessOptions,
): CommandProcess {
  return new CommandProcess(request, options);
}

class CommandProcess {
  private readonly child: ReturnType<typeof spawn>;
  private readonly close: Promise<{ code: number | null; error?: unknown }>;
  private readonly completion: Promise<RunCommandResult>;
  private readonly processControl: ProcessControl;
  private readonly stderrChunks: Buffer[] = [];
  private readonly stdoutChunks: Buffer[] = [];
  private closed = false;

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
    this.close = this.createClosePromise();
    this.completion = this.waitForResult();
    this.completion.catch(() => {});
  }

  endStdin(): void {
    this.child.stdin?.end();
  }

  endStdinBestEffort(): void {
    try {
      this.endStdin();
    } catch {
      // Cleanup keeps the primary stream or process failure.
    }
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
    if (
      this.closed ||
      this.child.exitCode !== null ||
      this.child.signalCode !== null
    ) {
      return;
    }

    terminateProcess(this.child, this.processControl, "SIGTERM");
  }

  async terminateAndWait(): Promise<void> {
    try {
      this.terminate();
    } catch {
      // Cleanup still waits for close or escalates below.
    }

    if (await this.waitForCloseWithin(this.terminationGraceMs())) {
      return;
    }

    try {
      terminateProcess(this.child, this.processControl, "SIGKILL");
    } catch {
      // A concurrent exit can make the escalation target disappear.
    }

    await this.close;
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

  async *readStdout(): AsyncIterable<Uint8Array> {
    for await (const chunk of this.stdout()) {
      const buffer = Buffer.from(chunk as Buffer);
      this.captureStdoutChunk(buffer);
      yield buffer;
    }

    await this.waitForSuccess();
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

  private createClosePromise(): Promise<{
    code: number | null;
    error?: unknown;
  }> {
    return new Promise((resolve) => {
      let spawnError: unknown;

      this.child.on("error", (error) => {
        spawnError = error;

        if (this.child.pid === undefined) {
          this.closed = true;
          resolve({ code: null, error });
        }
      });

      this.child.on("close", (code) => {
        this.closed = true;
        resolve({
          code,
          ...(spawnError !== undefined ? { error: spawnError } : {}),
        });
      });
    });
  }

  private waitForResult(): Promise<RunCommandResult> {
    return new Promise((resolve, reject) => {
      const timeoutMs = this.request.timeoutMs ?? defaultTimeoutMs;
      let settled = false;

      const settle = (callback: () => void): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        this.request.signal?.removeEventListener("abort", onAbort);
        callback();
      };

      const timer = setTimeout(() => {
        settle(() => {
          void this.terminateAndWait().then(() => {
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
        });
      }, timeoutMs);

      const onAbort = (): void => {
        settle(() => {
          void this.terminateAndWait().then(() => {
            reject(toError(this.request.signal?.reason ?? "Command aborted."));
          });
        });
      };

      if (this.request.signal?.aborted) {
        onAbort();
        return;
      }

      this.request.signal?.addEventListener("abort", onAbort, { once: true });

      void this.close.then(({ code, error }) => {
        settle(() => {
          const output = this.output();

          if (error !== undefined) {
            reject(
              new CommandSpawnError(
                `Command "${this.request.command}" failed to start.`,
                error,
                output.stderr,
                output.stdout,
              ),
            );
            return;
          }

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

  private terminationGraceMs(): number {
    return this.request.terminationGraceMs ?? defaultTerminationGraceMs;
  }

  private waitForCloseWithin(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);

      void this.close.then(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function terminateProcess(
  child: ReturnType<typeof spawn>,
  processControl: ProcessControl,
  signal: NodeJS.Signals,
): void {
  if (canUseProcessGroups(processControl) && child.pid !== undefined) {
    try {
      processControl.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (!isMissingProcessError(error)) {
        throw error;
      }
    }
  }

  child.kill(signal);
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
