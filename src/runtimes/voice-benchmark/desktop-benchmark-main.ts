import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem, type } from "node:os";

import { runCommand } from "../../adapters/desktop/process-runner.js";
import { parseVoiceArtifactManifest } from "./artifact-manifest.js";
import { calculateVoiceBenchmarkFingerprint } from "./benchmark-fingerprint.js";
import { runVoiceBenchmark } from "./benchmark-runner.js";
import {
  parseCandidateManifest,
  type VoiceBenchmarkCandidate,
  validateCandidateArtifacts,
} from "./candidate-manifest.js";
import { parseGnuTimeTelemetry } from "./command-telemetry.js";
import {
  executeSttCandidateProcess,
  executeTtsCandidateProcess,
} from "./candidate-process.js";
import { parseRecordingIndex } from "./corpus-manifest.js";
import { parseTtsCorpus } from "./tts-corpus.js";
import { parseDesktopBenchmarkOptions } from "./desktop-benchmark-options.js";
import {
  createSttCandidateCommand,
  createTtsCandidateCommand,
  parseSttCandidateTranscript,
} from "./desktop-candidate-driver.js";

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
  const artifactContents = await readFile(
    "benchmarks/voice/artifacts.json",
    "utf8",
  );
  const policyContents = await readFile("benchmarks/voice/policy.json", "utf8");
  const recordings = parseRecordingIndex(parseJson(recordingContents));
  const ttsCorpus = parseTtsCorpus(parseJson(ttsContents));
  const candidateManifest = parseCandidateManifest(
    parseJson(candidateContents),
  );
  validateCandidateArtifacts(
    candidateManifest,
    parseVoiceArtifactManifest(parseJson(artifactContents)),
    "x64",
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
      corpusSha256: calculateVoiceBenchmarkFingerprint({
        artifactContents,
        candidateContents,
        policyContents,
        recordingContents,
        ttsContents,
      }),
      device: {
        architecture: arch(),
        cpu: cpus()[0]?.model ?? "unknown",
        deviceId: "desktop-wsl2",
        kernel: release(),
        memoryBytes: totalmem(),
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
          createSttProfile(
            selectedCandidate,
            input.audioDurationMs,
            `${candidateId}-${input.id}-${repetition}`,
          ),
          input.filePath,
          { runCommand },
        );
      },
      executeTts: async ({ candidateId, input, repetition, text }) => {
        const outputPath = `${audioDirectory}/${candidateId}-${input.id}-${repetition}.wav`;
        return executeTtsCandidateProcess(
          createTtsProfile(
            selectedCandidate,
            outputPath,
            `${candidateId}-${input.id}-${repetition}`,
          ),
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

function createSttProfile(
  candidate: VoiceBenchmarkCandidate,
  audioDurationMs: number,
  key: string,
) {
  const command = createSttCandidateCommand(candidate, "{input}");
  const metricPath = `${metricDirectory}/${key}.tsv`;
  return {
    args: [
      "-f",
      "%U\t%S\t%M\t%e",
      "-o",
      metricPath,
      command.command,
      ...command.args,
    ],
    command: "/usr/bin/time",
    environment: command.environment,
    parseResult: async (result: { stderr: string; stdout: string }) => {
      const measured = parseGnuTimeTelemetry(
        await readFile(metricPath, "utf8"),
      );
      const startupMs = parseStartupMs(
        candidate.engine,
        `${result.stdout}\n${result.stderr}`,
      );
      return {
        cpuMs: measured.cpuMs,
        finalizationMs: Math.max(0, measured.wallMs - startupMs),
        peakRssBytes: measured.peakRssBytes,
        realTimeFactor: measured.wallMs / audioDurationMs,
        shutdownMs: null,
        startupMs,
        transcript: parseSttCandidateTranscript(
          candidate,
          candidate.desktopDriver.transcriptFormat === "sherpa-json"
            ? `${result.stdout}\n${result.stderr}`
            : result.stdout,
        ),
      };
    },
    timeoutMs: 30_000,
  };
}

function createTtsProfile(
  candidate: VoiceBenchmarkCandidate,
  outputPath: string,
  key: string,
) {
  const command = createTtsCandidateCommand(candidate, outputPath);
  const metricPath = `${metricDirectory}/${key}.tsv`;
  return {
    args: [
      "-f",
      "%U\t%S\t%M\t%e",
      "-o",
      metricPath,
      command.command,
      ...command.args,
    ],
    command: "/usr/bin/time",
    environment: command.environment,
    parseResult: async () => {
      const measured = parseGnuTimeTelemetry(
        await readFile(metricPath, "utf8"),
      );
      const audio = await readFile(outputPath);
      const audioDurationMs = wavDurationMs(audio);
      return {
        audioDurationMs,
        audioSha256: sha256(audio),
        cpuMs: measured.cpuMs,
        firstAudioMs: measured.wallMs,
        peakRssBytes: measured.peakRssBytes,
        realTimeFactor: measured.wallMs / audioDurationMs,
        shutdownMs: null,
        startupMs: null,
      };
    },
    timeoutMs: 30_000,
  };
}

function parseStartupMs(engine: string, output: string): number {
  if (engine === "sherpa-onnx") {
    const match = /Recognizer created in ([\d.]+) s/u.exec(output);
    return match ? Math.round(Number(match[1]) * 1_000) : 0;
  }
  const match = /load time\s*=\s*([\d.]+) ms/iu.exec(output);
  return match ? Math.round(Number(match[1])) : 0;
}

function wavDurationMs(audio: Buffer): number {
  if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("TTS candidate output must be a PCM WAV file.");
  }
  const byteRate = audio.readUInt32LE(28);
  const dataBytes = audio.readUInt32LE(40);
  if (byteRate === 0 || dataBytes === 0)
    throw new Error("TTS WAV must contain audio.");
  return Math.round((dataBytes / byteRate) * 1_000);
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
