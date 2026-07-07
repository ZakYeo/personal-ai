import type { ProcessControl } from "../adapters/desktop/process-runner.js";

export function createNodeProcessControl(
  processState: Pick<NodeJS.Process, "kill" | "platform">,
): ProcessControl {
  return {
    kill: (pid, signal) => {
      processState.kill(pid, signal);
    },
    platform: processState.platform,
  };
}
