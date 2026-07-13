import {
  type RunCommandRequest,
  startCommandProcess,
  toError,
} from "./command-process.js";

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

  try {
    for await (const chunk of chunks) {
      commandProcess.writeStdin(chunk);
    }
    commandProcess.endStdin();

    await commandProcess.waitForSuccess();
  } catch (error) {
    commandProcess.endStdinBestEffort();
    await commandProcess.terminateAndWait();
    throw toError(error);
  }
}
