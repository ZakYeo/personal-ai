import { spawnSync } from "node:child_process";

export function checkDesktopDependencies(
  platform = process.platform,
  run = spawnSync,
  env = process.env,
) {
  if (platform !== "linux") return { ...env };
  const required = [
    "gio-2.0 >= 2.70",
    "gtk+-3.0 >= 3.22",
    "webkit2gtk-4.1 >= 2.38",
    "ayatana-appindicator3-0.1",
  ];
  const candidates = env.PKG_CONFIG
    ? [env.PKG_CONFIG]
    : ["pkg-config", "/usr/bin/pkg-config"];
  let missing = required;
  for (const command of candidates) {
    missing = required.filter(
      (name) =>
        run(command, ["--exists", name], { stdio: "ignore", env }).status !== 0,
    );
    if (missing.length === 0) return { ...env, PKG_CONFIG: command };
  }
  if (missing.length > 0) {
    throw new Error(
      `Linux desktop dependency lookup failed using ${candidates.join(" or ")}. Missing libraries: ${missing.join(", ")}.\nOn Ubuntu/Debian run:\nsudo apt update\nsudo apt install build-essential pkg-config libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf\nThen retry your desktop command. See https://v2.tauri.app/start/prerequisites/ for other distributions.`,
    );
  }
}
