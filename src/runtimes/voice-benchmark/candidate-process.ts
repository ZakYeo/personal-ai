import type {
  RunCommandRequest,
  RunCommandResult,
} from "../../adapters/desktop/command-process.js";
import type {
  SttExecutionTelemetry,
  TtsExecutionTelemetry,
} from "./benchmark-runner.js";

interface CandidateProcessProfile {
  args: string[];
  command: string;
  environment: Record<string, string | undefined>;
  timeoutMs: number;
}

interface CandidateProcessDependencies {
  runCommand(request: RunCommandRequest): Promise<RunCommandResult>;
}

export async function executeSttCandidateProcess(
  profile: CandidateProcessProfile,
  inputPath: string,
  dependencies: CandidateProcessDependencies,
): Promise<SttExecutionTelemetry> {
  const inputPlaceholders = profile.args.filter(
    (argument) => argument === "{input}",
  ).length;
  if (inputPlaceholders !== 1) {
    throw new Error(
      "An STT candidate must declare exactly one {input} argument placeholder.",
    );
  }

  const result = await dependencies.runCommand({
    args: profile.args.map((argument) =>
      argument === "{input}" ? inputPath : argument,
    ),
    command: profile.command,
    environment: profile.environment,
    timeoutMs: profile.timeoutMs,
  });

  return parseSttTelemetry(parseDriverJson(result.stdout));
}

export async function executeTtsCandidateProcess(
  profile: CandidateProcessProfile,
  text: string,
  dependencies: CandidateProcessDependencies,
): Promise<TtsExecutionTelemetry> {
  const result = await dependencies.runCommand({
    args: [...profile.args],
    command: profile.command,
    environment: profile.environment,
    stdin: text,
    timeoutMs: profile.timeoutMs,
  });

  return parseTtsTelemetry(parseDriverJson(result.stdout));
}

function parseDriverJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error("Candidate driver output must be valid JSON.", {
      cause: error,
    });
  }
}

function parseSttTelemetry(value: unknown): SttExecutionTelemetry {
  const record = requireRecord(value);
  return {
    cpuMs: requireNonnegativeNumber(record, "cpuMs"),
    finalizationMs: requireNonnegativeNumber(record, "finalizationMs"),
    peakRssBytes: requireNonnegativeNumber(record, "peakRssBytes"),
    realTimeFactor: requireNonnegativeNumber(record, "realTimeFactor"),
    shutdownMs: requireNonnegativeNumber(record, "shutdownMs"),
    startupMs: requireNonnegativeNumber(record, "startupMs"),
    transcript: requireString(record, "transcript"),
  };
}

function parseTtsTelemetry(value: unknown): TtsExecutionTelemetry {
  const record = requireRecord(value);
  const audioSha256 = requireString(record, "audioSha256");
  if (!/^[a-f\d]{64}$/u.test(audioSha256)) {
    throw new Error(
      "Candidate driver field audioSha256 must be a SHA-256 hex digest.",
    );
  }

  return {
    audioDurationMs: requireNonnegativeNumber(record, "audioDurationMs"),
    audioSha256,
    cpuMs: requireNonnegativeNumber(record, "cpuMs"),
    firstAudioMs: requireNonnegativeNumber(record, "firstAudioMs"),
    peakRssBytes: requireNonnegativeNumber(record, "peakRssBytes"),
    realTimeFactor: requireNonnegativeNumber(record, "realTimeFactor"),
    shutdownMs: requireNonnegativeNumber(record, "shutdownMs"),
    startupMs: requireNonnegativeNumber(record, "startupMs"),
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Candidate driver output must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function requireNonnegativeNumber(
  record: Record<string, unknown>,
  field: string,
): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `Candidate driver field ${field} must be a nonnegative finite number.`,
    );
  }
  return value;
}

function requireString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`Candidate driver field ${field} must be a string.`);
  }
  return value;
}
