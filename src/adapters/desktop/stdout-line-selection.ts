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
  let pendingStdout = "";

  try {
    for await (const chunk of commandProcess.readStdout()) {
      pendingStdout += Buffer.from(chunk).toString("utf8");

      let newlineIndex = pendingStdout.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = pendingStdout.slice(0, newlineIndex).trim();
        pendingStdout = pendingStdout.slice(newlineIndex + 1);

        if (line.length > 0) {
          const selected = selectLine(line);

          if (selected !== undefined) {
            await commandProcess.terminateAndWait();

            return { ...commandProcess.output(), line: selected };
          }
        }

        newlineIndex = pendingStdout.indexOf("\n");
      }
    }

    const finalLine = pendingStdout.trim();
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
      output.stderr,
      output.stdout,
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
