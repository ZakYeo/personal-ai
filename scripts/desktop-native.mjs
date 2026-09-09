import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkDesktopDependencies } from "./desktop-dependencies.mjs";
import { desktopGraphicsEnvironment } from "./desktop-graphics.mjs";

try {
  const env = desktopGraphicsEnvironment(
    process.platform,
    checkDesktopDependencies(),
  );
  const [operation, ...args] = process.argv.slice(2);
  let command;
  let commandArgs;
  if (operation === "test") {
    command = "cargo";
    commandArgs = [
      "test",
      "--manifest-path",
      "apps/desktop/src-tauri/Cargo.toml",
      ...args,
    ];
  } else if (operation === "dev" || operation === "build") {
    command = process.execPath;
    commandArgs = [
      fileURLToPath(import.meta.resolve("@tauri-apps/cli/tauri.js")),
      operation,
      "--config",
      "apps/desktop/src-tauri/tauri.conf.json",
      ...args,
    ];
  } else {
    throw new Error("Expected native desktop dev, build, or test command.");
  }
  const result = spawnSync(command, commandArgs, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
