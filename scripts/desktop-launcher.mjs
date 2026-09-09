import { randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";

// The executable boundary owns actual process creation and process-tree signals.
export async function launchDesktop({
  env,
  signals,
  spawnChild,
  stopChild,
  write,
  shutdownMs = 5000,
}) {
  const childEnv = {
    ...env,
    PERSONAL_AI_PRESENTATION_TOKEN: randomBytes(32).toString("hex"),
    PERSONAL_AI_DESKTOP_OPEN_ON_START: "1",
  };
  const children = [];
  let settle;
  const finished = new Promise((resolve) => {
    settle = resolve;
  });
  const interrupt = () => settle(130);
  const terminate = () => settle(143);
  signals.on("SIGINT", interrupt);
  signals.on("SIGTERM", terminate);
  try {
    for (const name of ["start", "desktop:tauri:dev"]) {
      const child = spawnChild(name, childEnv);
      child.once("error", () => {
        write(`Unable to start ${name}.\n`);
        settle(1);
      });
      child.once("exit", (code, signal) => {
        write(`${name} stopped${signal ? ` (${signal})` : ""}.\n`);
        settle(code ?? 1);
      });
      children.push(child);
    }
  } catch {
    write("Unable to start the desktop session.\n");
    settle(1);
  }
  const code = await finished;
  const stop = (signal) => {
    for (const child of children) {
      try {
        stopChild(child, signal);
      } catch {
        write(`Unable to send ${signal} to a desktop child process.\n`);
      }
    }
  };
  try {
    stop("SIGTERM");
    // npm can exit before its service descendants finish saving state.
    await setTimeout(shutdownMs);
    // Kill remaining descendants even when their npm parent already exited.
    stop("SIGKILL");
  } finally {
    signals.off("SIGINT", interrupt);
    signals.off("SIGTERM", terminate);
  }
  return code;
}
