import {
  type RunCommandRequest,
  type RunCommandResult,
  startCommandProcess,
} from "./command-process.js";

export {
  CommandExecutionError,
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
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return commandProcess.waitForSuccess();
}
