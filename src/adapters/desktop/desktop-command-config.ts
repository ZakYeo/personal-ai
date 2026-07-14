export interface DesktopCommandConfig {
  args?: string[];
  command: string;
  environmentAllowlist?: string[];
  timeoutMs?: number;
}

const safeCommandEnvironmentKeys = [
  "HOME",
  "LANG",
  "LC_ALL",
  "PATH",
  "TEMP",
  "TMP",
  "TMPDIR",
] as const;

export function resolveDesktopCommandEnvironment(
  config: DesktopCommandConfig,
  environment: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    [...safeCommandEnvironmentKeys, ...(config.environmentAllowlist ?? [])].map(
      (key) => [key, environment[key]],
    ),
  );
}
