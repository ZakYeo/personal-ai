import { spawnSync } from "node:child_process";

const manifest = "apps/desktop/src-tauri/Cargo.toml";
const requiredLinuxPackages = ["gio-2.0", "gtk+-3.0", "webkit2gtk-4.1"];

if (process.platform === "linux" && !hasLinuxDesktopDependencies()) {
  process.stdout.write(
    "Native compile skipped: install the documented GTK/WebKit development packages; Windows CI compiles, tests, and packages the shell.\n",
  );
  process.exit(0);
}

const result = spawnSync("cargo", ["check", "--manifest-path", manifest], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);

function hasLinuxDesktopDependencies() {
  return requiredLinuxPackages.every(
    (name) =>
      spawnSync("pkg-config", ["--exists", name], { stdio: "ignore" })
        .status === 0,
  );
}
