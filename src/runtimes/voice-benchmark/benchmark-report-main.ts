import { readFile, rename, writeFile } from "node:fs/promises";

import { parseBenchmarkResult } from "./benchmark-aggregate.js";
import { parseVoiceBenchmarkPolicy } from "./benchmark-policy.js";
import { renderDesktopBenchmarkReport } from "./benchmark-report.js";

const resultPath = "benchmarks/voice/results/desktop-wsl2.json";
const reportPath = "benchmarks/voice/results/desktop-wsl2-report.md";
const result = parseBenchmarkResult(
  JSON.parse(await readFile(resultPath, "utf8")) as unknown,
);
const policy = parseVoiceBenchmarkPolicy(
  JSON.parse(await readFile("benchmarks/voice/policy.json", "utf8")) as unknown,
);
const temporaryPath = `${reportPath}.tmp`;
await writeFile(temporaryPath, renderDesktopBenchmarkReport(result, policy));
await rename(temporaryPath, reportPath);
process.stdout.write(`${reportPath}\n`);
