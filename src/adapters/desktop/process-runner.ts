import {
  type RunCommandRequest,
  type RunCommandResult,
  startCommandProcess,
} from "./command-process.js";

export {
  CommandAbortError,
  CommandExecutionError,
  CommandInputError,
  CommandSpawnError,
  CommandTimeoutError,
} from "./command-process.js";
export {
  runCommandReadableStream,
  runCommandWritableStream,
} from "./command-streams.js";
export { runCommandUntilStdoutLine } from "./stdout-line-selection.js";

export async function runCommand(
  request: RunCommandRequest,
): Promise<RunCommandResult> {
  const commandProcess = startCommandProcess(request, {
    captureStdout: true,
    detached: true,
    stdio: [request.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });

  if (request.stdin !== undefined) {
    try {
      await commandProcess.writeStdin(Buffer.from(request.stdin, "utf8"));
      await commandProcess.endStdin();
    } catch (error) {
      return commandProcess.terminateInputFailure(error);
    }
  }

  return commandProcess.waitForSuccess();
}
