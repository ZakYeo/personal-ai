import type { VoiceBenchmarkCandidate } from "./candidate-manifest.js";

interface CandidateCommand {
  args: string[];
  command: string;
  environment: Record<string, string>;
}

export function createSttCandidateCommand(
  candidate: VoiceBenchmarkCandidate,
  inputPath: string,
): CandidateCommand {
  if (candidate.operation !== "stt") {
    throw new Error(`Candidate ${candidate.id} does not support STT.`);
  }
  requireSafePath(inputPath, "inputPath");
  return createCommand(candidate, "{input}", inputPath);
}

export function createTtsCandidateCommand(
  candidate: VoiceBenchmarkCandidate,
  outputPath: string,
): CandidateCommand {
  if (candidate.operation !== "tts") {
    throw new Error(`Candidate ${candidate.id} does not support TTS.`);
  }
  requireSafePath(outputPath, "outputPath");
  return createCommand(candidate, "{output}", outputPath);
}

export function parseSttCandidateTranscript(
  candidate: VoiceBenchmarkCandidate,
  stdout: string,
): string {
  if (candidate.operation !== "stt") {
    throw new Error(`Candidate ${candidate.id} does not support STT.`);
  }
  if (candidate.desktopDriver.transcriptFormat === "plain") {
    const transcript = stdout.trim();
    if (transcript === "") {
      throw new Error("STT candidate returned an empty transcript.");
    }
    return transcript;
  }
  const jsonLine = stdout
    .split("\n")
    .find((line) => line.trim().startsWith('{ "text":'));
  if (!jsonLine)
    throw new Error("STT candidate returned no transcript object.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonLine) as unknown;
  } catch (error) {
    throw new Error("STT transcript object must be valid JSON.", {
      cause: error,
    });
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("text" in parsed) ||
    typeof parsed.text !== "string" ||
    parsed.text.trim() === ""
  ) {
    throw new Error("STT transcript object must contain nonempty text.");
  }
  return parsed.text;
}

function createCommand(
  candidate: VoiceBenchmarkCandidate,
  placeholder: "{input}" | "{output}",
  replacement: string,
): CandidateCommand {
  return {
    args: candidate.desktopDriver.args.map((argument) =>
      argument === placeholder ? replacement : argument,
    ),
    command: candidate.desktopDriver.command,
    environment: { ...candidate.desktopDriver.environment },
  };
}

function requireSafePath(value: string, label: string): void {
  if (value.startsWith("/") || value.split("/").includes("..")) {
    throw new Error(`${label} must be a safe relative path.`);
  }
}
