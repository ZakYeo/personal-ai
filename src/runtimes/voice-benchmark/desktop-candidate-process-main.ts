import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { runCommand } from "../../adapters/desktop/process-runner.js";
import { parseCandidateManifest } from "./candidate-manifest.js";
import { parseGnuTimeTelemetry } from "./command-telemetry.js";
import {
  createSttCandidateCommand,
  createTtsCandidateCommand,
  parseSttCandidateTranscript,
} from "./desktop-candidate-driver.js";

const options = parseOptions(process.argv.slice(2));
const manifest = parseCandidateManifest(
  JSON.parse(
    await readFile("benchmarks/voice/candidates.json", "utf8"),
  ) as unknown,
);
const candidate = manifest.candidates.find(
  ({ id }) => id === options.candidateId,
);
if (!candidate) throw new Error(`Unknown candidate ${options.candidateId}.`);

if (candidate.operation === "stt") {
  if (!options.inputPath || options.audioDurationMs === undefined) {
    throw new Error("STT driver requires input and audio duration.");
  }
  const command = createSttCandidateCommand(candidate, options.inputPath);
  const measured = await executeMeasured(command, options.metricPath);
  const startupMs = parseStartupMs(candidate.engine, measured.diagnostics);
  process.stdout.write(
    JSON.stringify({
      cpuMs: measured.cpuMs,
      finalizationMs: Math.max(0, measured.wallMs - startupMs),
      peakRssBytes: measured.peakRssBytes,
      realTimeFactor: measured.wallMs / options.audioDurationMs,
      shutdownMs: 0,
      startupMs,
      transcript: parseSttCandidateTranscript(candidate, measured.stdout),
    }),
  );
} else {
  if (!options.outputPath) throw new Error("TTS driver requires output.");
  const text = await readStdin();
  if (text.trim() === "") throw new Error("TTS stdin must be nonempty.");
  const command = createTtsCandidateCommand(candidate, options.outputPath);
  const measured = await executeMeasured(
    command,
    options.metricPath,
    `${text.trim()}\n`,
  );
  const audio = await readFile(options.outputPath);
  const audioDurationMs = wavDurationMs(audio);
  process.stdout.write(
    JSON.stringify({
      audioDurationMs,
      audioSha256: createHash("sha256").update(audio).digest("hex"),
      cpuMs: measured.cpuMs,
      firstAudioMs: measured.wallMs,
      peakRssBytes: measured.peakRssBytes,
      realTimeFactor: measured.wallMs / audioDurationMs,
      shutdownMs: 0,
      startupMs: measured.wallMs,
    }),
  );
}

async function executeMeasured(
  command: ReturnType<typeof createSttCandidateCommand>,
  metricPath: string,
  stdin?: string,
) {
  const result = await runCommand({
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
    ...(stdin === undefined ? {} : { stdin }),
    timeoutMs: 30_000,
  });
  return {
    ...parseGnuTimeTelemetry(await readFile(metricPath, "utf8")),
    diagnostics: `${result.stdout}\n${result.stderr}`,
    stdout: result.stdout,
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

async function readStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let text = "";
  for await (const untrustedChunk of process.stdin) {
    const chunk: unknown = untrustedChunk;
    if (typeof chunk !== "string")
      throw new Error("TTS stdin must be UTF-8 text.");
    text += chunk;
  }
  return text;
}

function parseOptions(args: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined)
      throw new Error("Invalid driver options.");
    values.set(key.slice(2), value);
  }
  const candidateId = values.get("candidate");
  const metricPath = values.get("metric");
  if (!candidateId || !metricPath)
    throw new Error("Driver requires candidate and metric.");
  const duration = values.get("audio-duration-ms");
  return {
    candidateId,
    metricPath,
    ...(values.has("input") ? { inputPath: values.get("input")! } : {}),
    ...(values.has("output") ? { outputPath: values.get("output")! } : {}),
    ...(duration === undefined ? {} : { audioDurationMs: Number(duration) }),
  };
}
