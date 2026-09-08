import { spawn, spawnSync } from "node:child_process";
import { URL } from "node:url";
import { checkDesktopDependencies } from "./desktop-dependencies.mjs";
import { launchDesktop } from "./desktop-launcher.mjs";

try {
  checkDesktopDependencies();
  if (!process.env.npm_execpath)
    throw new Error("Start with npm run start:desktop.");
  process.stdout.write(
    "Starting Jarvis and its desktop UI. Open the UI from the system tray; Ctrl+C stops both.\n",
  );
  process.exitCode = await launchDesktop({
    env: process.env,
    signals: process,
    write: (message) => process.stderr.write(message),
    spawnChild: (name, env) =>
      spawn(process.execPath, [process.env.npm_execpath, "run", name], {
        cwd: new URL("..", import.meta.url),
        env,
        stdio: "inherit",
        detached: process.platform !== "win32",
      }),
    stopChild: (child, signal) => {
      if (!child.pid) return;
      if (process.platform === "win32") {
        const result = spawnSync(
          "taskkill",
          [
            "/pid",
            String(child.pid),
            "/T",
            ...(signal === "SIGKILL" ? ["/F"] : []),
          ],
          { stdio: "ignore", timeout: 2000 },
        );
        if (result.error) throw result.error;
      } else {
        try {
          process.kill(-child.pid, signal);
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      }
    },
  });
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
