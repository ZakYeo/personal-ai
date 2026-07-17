import { readFile, rename, writeFile } from "node:fs/promises";

import { parseBenchmarkResult } from "./benchmark-aggregate.js";
import {
  calculateVoiceBenchmarkFingerprint,
  requireVoiceBenchmarkFingerprint,
} from "./benchmark-fingerprint.js";
import { parseVoiceBenchmarkPolicy } from "./benchmark-policy.js";
import { renderDesktopBenchmarkReport } from "./benchmark-report.js";

const resultPath = "benchmarks/voice/results/desktop-wsl2.json";
const reportPath = "benchmarks/voice/results/desktop-wsl2-report.md";
const result = parseBenchmarkResult(
  JSON.parse(await readFile(resultPath, "utf8")) as unknown,
);
const recordingContents = await readFile(
  "benchmarks/voice/corpus/personal-recordings.json",
  "utf8",
);
const ttsContents = await readFile(
  "benchmarks/voice/corpus/tts-responses.json",
  "utf8",
);
const candidateContents = await readFile(
  "benchmarks/voice/candidates.json",
  "utf8",
);
const artifactContents = await readFile(
  "benchmarks/voice/artifacts.json",
  "utf8",
);
const policyContents = await readFile("benchmarks/voice/policy.json", "utf8");
requireVoiceBenchmarkFingerprint(
  result.corpusSha256,
  calculateVoiceBenchmarkFingerprint({
    artifactContents,
    candidateContents,
    policyContents,
    recordingContents,
    ttsContents,
  }),
);
const policy = parseVoiceBenchmarkPolicy(JSON.parse(policyContents) as unknown);
const temporaryPath = `${reportPath}.tmp`;
await writeFile(temporaryPath, renderDesktopBenchmarkReport(result, policy));
await rename(temporaryPath, reportPath);
process.stdout.write(`${reportPath}\n`);
