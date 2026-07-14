import { spawn } from "node:child_process";
import type { ProcessControl } from "../../ports/process-control.js";

export interface RunCommandRequest {
  args?: string[];
  command: string;
  environment?: Record<string, string | undefined>;
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
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "CommandTimeoutError";
  }
}

export class CommandAbortError extends Error {
  constructor(
    message: string,
    readonly reason: unknown,
    readonly stderr: string,
    readonly stdout: string,
  ) {
    super(message, { cause: reason });
    this.name = "CommandAbortError";
  }
}

export class CommandInputError extends Error {
  constructor(
    message: string,
    readonly cause: unknown,
    readonly stderr: string,
    readonly stdout: string,
  ) {
    super(message, { cause });
    this.name = "CommandInputError";
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

export function isCommandDiagnosticError(
  error: unknown,
): error is
  | CommandAbortError
  | CommandExecutionError
  | CommandInputError
  | CommandSpawnError
  | CommandTimeoutError {
  return (
    error instanceof CommandAbortError ||
    error instanceof CommandExecutionError ||
    error instanceof CommandInputError ||
    error instanceof CommandSpawnError ||
    error instanceof CommandTimeoutError
  );
}

class CommandTerminationError extends Error {
  constructor(
    message: string,
    readonly cause: unknown,
    readonly stderr: string,
    readonly stdout: string,
  ) {
    super(message, { cause });
    this.name = "CommandTerminationError";
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
      env: definedEnvironment(request.environment ?? {}),
      stdio: options.stdio,
    });

    this.captureOutput(options);
    this.child.stdin?.on("error", () => {
      // Per-operation callbacks settle stdin failures through command diagnostics.
    });
    this.close = this.createClosePromise();
    this.completion = this.waitForResult();
    this.completion.catch(() => {});
  }

  endStdin(): Promise<void> {
    return this.runStdinOperation((stdin, complete) => {
      stdin.end(complete);
    });
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
    const errors: unknown[] = [];

    try {
      this.terminate();
    } catch (error) {
      errors.push(error);
    }

    if (await this.waitForCloseWithin(this.terminationGraceMs())) {
      return;
    }

    try {
      terminateProcess(this.child, this.processControl, "SIGKILL");
    } catch (error) {
      errors.push(error);
    }

    if (await this.waitForCloseWithin(this.terminationGraceMs())) {
      return;
    }

    const output = this.output();
    throw new CommandTerminationError(
      `Command "${this.request.command}" did not exit after termination signals.`,
      new AggregateError(errors, "Command termination failed."),
      output.stderr,
      output.stdout,
    );
  }

  async terminateInputFailure(error: unknown): Promise<never> {
    let cleanupError: unknown;

    try {
      await this.terminateAndWait();
    } catch (terminationError) {
      cleanupError = terminationError;
    }

    const inputError = toError(error);
    const output = this.output();
    throw new CommandInputError(
      inputError.message,
      cleanupError === undefined
        ? inputError
        : new AggregateError(
            [inputError, cleanupError],
            "Command input and cleanup both failed.",
          ),
      output.stderr,
      output.stdout,
    );
  }

  waitForSuccess(): Promise<RunCommandResult> {
    return this.completion;
  }

  writeStdin(chunk: Uint8Array): Promise<void> {
    return this.runStdinOperation((stdin, complete) => {
      stdin.write(chunk, complete);
    });
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

  private runStdinOperation(
    operation: (
      stdin: NonNullable<(typeof this.child)["stdin"]>,
      complete: (error?: Error | null) => void,
    ) => void,
  ): Promise<void> {
    const stdin = this.child.stdin;

    if (!stdin) {
      return Promise.reject(new Error("Command did not provide stdin."));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (error?: Error | null): void => {
        if (settled) {
          return;
        }

        settled = true;
        stdin.removeListener("error", settle);

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      stdin.once("error", settle);
      operation(stdin, settle);
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
          void this.createFailureAfterTermination((output, cleanupError) =>
            reject(
              new CommandTimeoutError(
                `Command "${this.request.command}" timed out after ${timeoutMs}ms.`,
                timeoutMs,
                output.stderr,
                output.stdout,
                cleanupError,
              ),
            ),
          );
        });
      }, timeoutMs);

      const onAbort = (): void => {
        settle(() => {
          const signalReason = this.request.signal?.reason as unknown;
          const reason = signalReason ?? "Command aborted.";

          void this.createFailureAfterTermination((output, cleanupError) => {
            const error = new CommandAbortError(
              toError(reason).message,
              reason,
              output.stderr,
              output.stdout,
            );

            reject(
              cleanupError === undefined
                ? error
                : attachSecondaryCause(error, cleanupError),
            );
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

  private async createFailureAfterTermination(
    create: (output: RunCommandResult, cleanupError?: unknown) => void,
  ): Promise<void> {
    let cleanupError: unknown;

    try {
      await this.terminateAndWait();
    } catch (error) {
      cleanupError = error;
    }

    create(this.output(), cleanupError);
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

function definedEnvironment(
  environment: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function attachSecondaryCause<TError extends Error>(
  primaryError: TError,
  secondaryError: unknown,
): TError {
  const existingCause = primaryError.cause;
  const cause =
    existingCause === undefined
      ? secondaryError
      : new AggregateError(
          [existingCause, secondaryError],
          "Primary failure and command cleanup both failed.",
        );

  Object.defineProperty(primaryError, "cause", {
    configurable: true,
    value: cause,
  });

  return primaryError;
}

function terminateProcess(
  child: ReturnType<typeof spawn>,
  processControl: ProcessControl,
  signal: NodeJS.Signals,
): void {
  let groupError: unknown;

  if (canUseProcessGroups(processControl) && child.pid !== undefined) {
    try {
      processControl.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (isMissingProcessError(error)) {
        return;
      }

      groupError = error;
    }
  }

  try {
    if (!child.kill(signal)) {
      throw new Error(`Direct child ${signal} signal was not delivered.`);
    }
  } catch (error) {
    throw new AggregateError(
      groupError === undefined ? [error] : [groupError, error],
      `Failed to deliver ${signal} to command process.`,
      { cause: error },
    );
  }
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
