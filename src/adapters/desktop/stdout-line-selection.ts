import {
  attachSecondaryCause,
  CommandExecutionError,
  type RunCommandRequest,
  type RunCommandResult,
  startCommandProcess,
  toError,
} from "./command-process.js";

export async function runCommandUntilStdoutLine<TLine>(
  request: RunCommandRequest,
  selectLine: (line: string) => TLine | undefined,
): Promise<RunCommandResult & { line: TLine }> {
  const commandProcess = startCommandProcess(request, {
    captureStdout: false,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let pendingStdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);

  try {
    for await (const chunk of commandProcess.readStdout()) {
      const bytes = Buffer.from(chunk);
      let offset = 0;

      while (offset < bytes.length) {
        const newlineIndex = bytes.indexOf(0x0a, offset);
        const end = newlineIndex < 0 ? bytes.length : newlineIndex;
        pendingStdout = appendProtocolLineBytes(
          pendingStdout,
          bytes.subarray(offset, end),
          request.command,
          commandProcess.output(),
        );

        if (newlineIndex < 0) break;

        const line = pendingStdout.toString("utf8").trim();
        pendingStdout = Buffer.alloc(0);

        if (line.length > 0) {
          const selected = selectLine(line);

          if (selected !== undefined) {
            await commandProcess.terminateAndWait();

            return { ...commandProcess.output(), line: selected };
          }
        }
        offset = newlineIndex + 1;
      }
    }

    const finalLine = pendingStdout.toString("utf8").trim();
    if (finalLine.length > 0) {
      const selected = selectLine(finalLine);

      if (selected !== undefined) {
        await commandProcess.terminateAndWait();

        return { ...commandProcess.output(), line: selected };
      }
    }

    const output = await commandProcess.waitForSuccess();

    throw new CommandExecutionError(
      `Command "${request.command}" exited without wake activation output.`,
      0,
      output,
    );
  } catch (error) {
    const primaryError = toError(error);

    try {
      await commandProcess.terminateAndWait();
    } catch (cleanupError) {
      attachSecondaryCause(primaryError, cleanupError);
    }

    throw primaryError;
  }
}

const maximumProtocolLineBytes = 64 * 1_024;

function appendProtocolLineBytes(
  pending: Buffer<ArrayBufferLike>,
  chunk: Buffer<ArrayBufferLike>,
  command: string,
  output: RunCommandResult,
): Buffer<ArrayBufferLike> {
  if (pending.length + chunk.length > maximumProtocolLineBytes) {
    throw new CommandExecutionError(
      `Command "${command}" produced a stdout protocol line above ${maximumProtocolLineBytes} bytes.`,
      null,
      output,
    );
  }

  return pending.length === 0
    ? Buffer.from(chunk)
    : Buffer.concat([pending, chunk], pending.length + chunk.length);
}
