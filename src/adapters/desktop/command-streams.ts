import {
  attachSecondaryCause,
  type RunCommandRequest,
  isCommandDiagnosticError,
  startCommandProcess,
  toError,
} from "./command-process.js";
import { cleanupAsyncIteratorWithinDeadline } from "../async-iterator-cleanup.js";

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
  const stdoutIterator = commandProcess.readStdout()[Symbol.asyncIterator]();

  return {
    next: () => stdoutIterator.next(),
    return: async () => {
      await commandProcess.terminateAndWait();

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
    detached: true,
    stdio: ["pipe", "ignore", "pipe"],
  });
  const commandCompletion = commandProcess.waitForSuccess();
  const iterator = chunks[Symbol.asyncIterator]();
  let iteratorCleanupAttempted = false;
  let iteratorDone = false;

  try {
    while (true) {
      const next = await raceWithCommandCompletion(
        iterator.next(),
        commandCompletion,
      );

      if (next.kind === "command_completed") {
        break;
      }

      if (next.value.done) {
        iteratorDone = true;
        const ended = await raceWithCommandCompletion(
          commandProcess.endStdin(),
          commandCompletion,
        );

        if (ended.kind === "operation_completed") {
          await commandCompletion;
        }
        break;
      }

      const written = await raceWithCommandCompletion(
        commandProcess.writeStdin(next.value.value),
        commandCompletion,
      );

      if (written.kind === "command_completed") {
        break;
      }
    }

    iteratorCleanupAttempted = !iteratorDone;
    const cleanupError = iteratorCleanupAttempted
      ? await cleanupAsyncIteratorWithinDeadline(iterator, {
          label: "Command input",
          timeoutMs: iteratorCleanupDeadlineMs,
        })
      : undefined;

    if (cleanupError) {
      throw cleanupError;
    }
  } catch (error) {
    const cleanupError =
      iteratorDone || iteratorCleanupAttempted
        ? undefined
        : await cleanupAsyncIteratorWithinDeadline(iterator, {
            label: "Command input",
            timeoutMs: iteratorCleanupDeadlineMs,
          });

    if (isCommandDiagnosticError(error)) {
      throw cleanupError === undefined
        ? error
        : attachSecondaryCause(error, cleanupError);
    }

    const inputError = toError(error);
    await commandProcess.terminateInputFailure(
      cleanupError === undefined
        ? inputError
        : attachSecondaryCause(inputError, cleanupError),
    );
  }
}

type CommandRaceResult<TValue> =
  | { kind: "command_completed" }
  | { kind: "operation_completed"; value: TValue };

function raceWithCommandCompletion<TValue>(
  operation: Promise<TValue>,
  commandCompletion: Promise<unknown>,
): Promise<CommandRaceResult<TValue>> {
  return Promise.race([
    operation.then((value) => ({
      kind: "operation_completed" as const,
      value,
    })),
    commandCompletion.then(() => ({ kind: "command_completed" as const })),
  ]);
}

const iteratorCleanupDeadlineMs = 1_000;
