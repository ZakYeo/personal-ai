import { spawnSync } from "node:child_process";

const manifest = "apps/desktop/src-tauri/Cargo.toml";
import { checkDesktopDependencies } from "./desktop-dependencies.mjs";

try {
  checkDesktopDependencies();
} catch (error) {
  process.stdout.write(`Native compile skipped: ${error.message}\n`);
  process.exit(0);
}

const result = spawnSync("cargo", ["check", "--manifest-path", manifest], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
