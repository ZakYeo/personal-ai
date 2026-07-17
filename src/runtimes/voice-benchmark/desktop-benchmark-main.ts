import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { arch, cpus, freemem, platform, release, type } from "node:os";

import { runCommand } from "../../adapters/desktop/process-runner.js";
import { runVoiceBenchmark } from "./benchmark-runner.js";
import { parseGnuTimeTelemetry } from "./command-telemetry.js";
import { parseRecordingIndex } from "./corpus-manifest.js";
import {
  createSttCandidateCommand,
  createTtsCandidateCommand,
  parseSttCandidateTranscript,
} from "./desktop-candidate-driver.js";
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
  const sttCandidateIds = [
    "whisper-base-en",
    "whisper-small-en",
    "sherpa-zipformer-en-20m-int8",
  ];
  const ttsCandidateIds = ["piper-alba-medium", "sherpa-amy-low"];
  if (
    !sttCandidateIds.includes(options.candidateId) &&
    !ttsCandidateIds.includes(options.candidateId)
  ) {
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
      sttCandidates: sttCandidateIds.includes(options.candidateId)
        ? [options.candidateId]
        : [],
      sttInputs: selectedSttInputs,
      ttsCandidates: ttsCandidateIds.includes(options.candidateId)
        ? [options.candidateId]
        : [],
      ttsInputs: selectedTtsInputs,
    },
    {
      executeStt: async ({ candidateId, input, repetition }) => {
        const command = createSttCandidateCommand(candidateId, input.filePath);
        const measured = await executeMeasured(
          command,
          `${candidateId}-${input.id}-${repetition}`,
        );
        const startupMs = parseStartupMs(candidateId, measured.diagnostics);
        return {
          cpuMs: measured.cpuMs,
          finalizationMs: Math.max(0, measured.wallMs - startupMs),
          peakRssBytes: measured.peakRssBytes,
          realTimeFactor: measured.wallMs / input.audioDurationMs,
          shutdownMs: 0,
          startupMs,
          transcript: parseSttCandidateTranscript(candidateId, measured.stdout),
        };
      },
      executeTts: async ({ candidateId, input, repetition, text }) => {
        const outputPath = `${audioDirectory}/${candidateId}-${input.id}-${repetition}.wav`;
        const command = createTtsCandidateCommand(
          candidateId,
          text,
          outputPath,
        );
        const measured = await executeMeasured(
          command,
          `${candidateId}-${input.id}-${repetition}`,
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
          shutdownMs: 0,
          startupMs: measured.wallMs,
        };
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
  await writeFile(
    options.outputPath,
    `${JSON.stringify(result, undefined, 2)}\n`,
    { mode: 0o600 },
  );
  process.stdout.write(`${options.outputPath}\n`);
}

async function executeMeasured(
  command: ReturnType<
    typeof createSttCandidateCommand | typeof createTtsCandidateCommand
  >,
  key: string,
) {
  const metricPath = `${metricDirectory}/${key}.tsv`;
  const engineArgs = [...command.args];
  let stdin = command.stdin;
  if (command.stdinMode === "append-as-final-argument") {
    engineArgs.push(command.stdin?.trim() ?? "");
    stdin = undefined;
  }
  const result = await runCommand({
    args: [
      "-f",
      "%U\t%S\t%M\t%e",
      "-o",
      metricPath,
      command.command,
      ...engineArgs,
    ],
    command: "/usr/bin/time",
    environment: minimalEnvironment(command.command),
    ...(stdin === undefined ? {} : { stdin }),
    timeoutMs: 30_000,
  });
  return {
    ...parseGnuTimeTelemetry(await readFile(metricPath, "utf8")),
    diagnostics: `${result.stdout}\n${result.stderr}`,
    stdout: result.stdout,
  };
}

function minimalEnvironment(command: string): Record<string, string> {
  if (command.includes("whisper.cpp")) {
    return {
      LD_LIBRARY_PATH:
        ".voice-benchmark/install/whisper.cpp-v1.8.6-source/build/src:.voice-benchmark/install/whisper.cpp-v1.8.6-source/build/ggml/src",
    };
  }
  if (command.includes("sherpa-onnx")) {
    return {
      LD_LIBRARY_PATH: ".voice-benchmark/install/sherpa-onnx-v1.13.2-x64/lib",
    };
  }
  return {};
}

function parseStartupMs(candidateId: string, output: string): number {
  if (candidateId === "sherpa-zipformer-en-20m-int8") {
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
  if (byteRate === 0 || dataBytes === 0) {
    throw new Error("TTS candidate WAV must contain audio.");
  }
  return Math.round((dataBytes / byteRate) * 1_000);
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
