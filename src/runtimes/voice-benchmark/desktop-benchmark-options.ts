interface DesktopBenchmarkOptions {
  candidateId: string;
  count: number;
  outputPath: string;
  start: number;
}

export function parseDesktopBenchmarkOptions(
  args: readonly string[],
): DesktopBenchmarkOptions {
  if (
    args.length !== 8 ||
    args[0] !== "--candidate" ||
    args[2] !== "--start" ||
    args[4] !== "--count" ||
    args[6] !== "--output"
  ) {
    throw new Error(
      "Expected --candidate <id> --start <index> --count <count> --output <path>.",
    );
  }
  const candidateId = requireString(args[1], "candidate");
  const start = Number(args[3]);
  const count = Number(args[5]);
  const outputPath = requireString(args[7], "output");
  if (!Number.isSafeInteger(start) || start < 0) {
    throw new Error("start must be a nonnegative integer.");
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > 10) {
    throw new Error("count must be an integer from 1 to 10.");
  }
  if (outputPath.startsWith("/") || outputPath.split("/").includes("..")) {
    throw new Error("output must be a safe relative path.");
  }
  return { candidateId, count, outputPath, start };
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a nonempty string.`);
  }
  return value;
}
