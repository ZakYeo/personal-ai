import { isAbsolute, normalize, resolve } from "node:path";

export function resolveLocalStatePath(
  configuredPath: string,
  configDirectory?: string,
): string {
  if (isAbsolute(configuredPath)) {
    return normalize(configuredPath);
  }

  if (!configDirectory) {
    throw new Error("Relative local state paths require a config directory.");
  }

  return resolve(configDirectory, configuredPath);
}
