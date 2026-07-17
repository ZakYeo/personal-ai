import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { arch, cpus, freemem, platform, release, type } from "node:os";

import { runCommand } from "../../adapters/desktop/process-runner.js";
import { runVoiceBenchmark } from "./benchmark-runner.js";
import { parseCandidateManifest } from "./candidate-manifest.js";
import {
  executeSttCandidateProcess,
  executeTtsCandidateProcess,
} from "./candidate-process.js";
import { parseRecordingIndex } from "./corpus-manifest.js";
import { parseTtsCorpus } from "./tts-corpus.js";
import { parseDesktopBenchmarkOptions } from "./desktop-benchmark-options.js";

const resultDirectory = ".voice-benchmark/results/desktop-wsl2";
const metricDirectory = `${resultDirectory}/metrics`;
const audioDirectory = `${resultDirectory}/audio`;

await main();

async function main(): Promise<void> {
  const options = parseDesktopBenchmarkOptions(process.argv.slice(2));
  await mkdir(metricDirectory, { mode: 0o700, recursive: true });
  await mkdir(audioDirectory, { mode: 0o700, recursive: true });
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
  const policyContents = await readFile("benchmarks/voice/policy.json", "utf8");
  const recordings = parseRecordingIndex(parseJson(recordingContents));
  const ttsCorpus = parseTtsCorpus(parseJson(ttsContents));
  const candidateManifest = parseCandidateManifest(
    parseJson(candidateContents),
  );
  const sttInputs = await Promise.all(
    recordings.recordings.map(async (recording) => {
      const bytes = await readFile(recording.filePath);
      return {
        audioDurationMs: Math.round(((bytes.length - 44) / 2 / 16_000) * 1_000),
        expectedText: recording.phraseText,
        filePath: recording.filePath,
        id: recording.phraseId,
        kind: "personal" as const,
        speechEndMs: Math.round((recording.speechEndSample / 16_000) * 1_000),
      };
    }),
  );
  const selectedCandidate = candidateManifest.candidates.find(
    ({ id }) => id === options.candidateId,
  );
  if (!selectedCandidate) {
    throw new Error(`Unknown candidate ${options.candidateId}.`);
  }
  const selectedSttInputs = sttInputs.slice(
    options.start,
    options.start + options.count,
  );
  const selectedTtsInputs = ttsCorpus.fixtures
    .slice(options.start, options.start + options.count)
    .map((fixture) => ({
      expectedFacts: [...fixture.expectedFacts],
      id: fixture.id,
      text: fixture.text,
    }));
  const result = await runVoiceBenchmark(
    {
      corpusSha256: sha256(
        [
          recordingContents,
          ttsContents,
          candidateContents,
          policyContents,
        ].join("\0"),
      ),
      device: {
        architecture: arch(),
        cpu: cpus()[0]?.model ?? "unknown",
        deviceId: "desktop-wsl2",
        kernel: release(),
        memoryBytes: freemem(),
        os: `${type()} ${platform()}`,
      },
      startedAt: new Date().toISOString(),
      sttCandidates:
        selectedCandidate.operation === "stt" ? [options.candidateId] : [],
      sttInputs: selectedSttInputs,
      ttsCandidates:
        selectedCandidate.operation === "tts" ? [options.candidateId] : [],
      ttsInputs: selectedTtsInputs,
    },
    {
      executeStt: async ({ candidateId, input, repetition }) => {
        return executeSttCandidateProcess(
          createDriverProfile(candidateId, input.id, repetition, [
            "--input",
            "{input}",
            "--audio-duration-ms",
            String(input.audioDurationMs),
          ]),
          input.filePath,
          { runCommand },
        );
      },
      executeTts: async ({ candidateId, input, repetition, text }) => {
        const outputPath = `${audioDirectory}/${candidateId}-${input.id}-${repetition}.wav`;
        return executeTtsCandidateProcess(
          createDriverProfile(candidateId, input.id, repetition, [
            "--output",
            outputPath,
          ]),
          text,
          { runCommand },
        );
      },
    },
  );
  await mkdir(
    options.outputPath.slice(0, options.outputPath.lastIndexOf("/")),
    {
      mode: 0o700,
      recursive: true,
    },
  );
  const temporaryOutputPath = `${options.outputPath}.tmp`;
  await writeFile(
    temporaryOutputPath,
    `${JSON.stringify(result, undefined, 2)}\n`,
    { mode: 0o600 },
  );
  await rename(temporaryOutputPath, options.outputPath);
  process.stdout.write(`${options.outputPath}\n`);
}

function createDriverProfile(
  candidateId: string,
  inputId: string,
  repetition: number,
  operationArgs: string[],
) {
  return {
    args: [
      "--import",
      "tsx",
      "src/runtimes/voice-benchmark/desktop-candidate-process-main.ts",
      "--candidate",
      candidateId,
      "--metric",
      `${metricDirectory}/${candidateId}-${inputId}-${repetition}.tsv`,
      ...operationArgs,
    ],
    command: "/usr/bin/node",
    environment: {},
    timeoutMs: 35_000,
  };
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
