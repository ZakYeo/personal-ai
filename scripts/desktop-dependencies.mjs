import { spawnSync } from "node:child_process";

export function checkDesktopDependencies(
  platform = process.platform,
  run = spawnSync,
) {
  if (platform !== "linux") return;
  const missing = [
    "gio-2.0 >= 2.70",
    "gtk+-3.0 >= 3.22",
    "webkit2gtk-4.1 >= 2.38",
    "ayatana-appindicator3-0.1",
  ].filter(
    (name) =>
      run("pkg-config", ["--exists", name], { stdio: "ignore" }).status !== 0,
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing Linux desktop development libraries: ${missing.join(", ")}.\nOn Ubuntu/Debian run:\nsudo apt update\nsudo apt install build-essential pkg-config libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf\nThen retry your desktop command. See https://v2.tauri.app/start/prerequisites/ for other distributions.`,
    );
  }
}
