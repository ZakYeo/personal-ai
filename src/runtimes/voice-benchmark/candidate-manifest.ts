import type {
  ArtifactArchitecture,
  VoiceArtifactManifest,
} from "./artifact-manifest.js";

interface DesktopCandidateDriver {
  args: readonly string[];
  command: string;
  environment: Readonly<Record<string, string>>;
  transcriptFormat?: "plain" | "sherpa-json";
}

export interface VoiceBenchmarkCandidate {
  artifactIds: readonly string[];
  engine: "piper" | "sherpa-onnx" | "whisper.cpp";
  executable: string;
  id: string;
  installDirectory: string;
  modelFiles: readonly string[];
  operation: "stt" | "tts";
  revision: string;
  desktopDriver: DesktopCandidateDriver;
}

interface CandidateManifest {
  candidates: readonly VoiceBenchmarkCandidate[];
  schemaVersion: 1;
}

export function parseCandidateManifest(input: unknown): CandidateManifest {
  const record = requireRecord(input, "candidate manifest");
  if (record.schemaVersion !== 1) {
    throw new Error("candidate manifest schemaVersion must be 1.");
  }
  if (!Array.isArray(record.candidates) || record.candidates.length === 0) {
    throw new Error("candidate manifest candidates must be nonempty.");
  }
  const ids = new Set<string>();
  const candidates = record.candidates.map((value, index) => {
    const label = `candidates[${index}]`;
    const candidate = requireRecord(value, label);
    const id = requireStableId(candidate.id, `${label}.id`);
    if (ids.has(id)) {
      throw new Error(`candidate manifest contains duplicate ID ${id}.`);
    }
    ids.add(id);
    const engine = candidate.engine;
    if (
      engine !== "piper" &&
      engine !== "sherpa-onnx" &&
      engine !== "whisper.cpp"
    ) {
      throw new Error(`${label}.engine is unsupported.`);
    }
    const operation = candidate.operation;
    if (operation !== "stt" && operation !== "tts") {
      throw new Error(`${label}.operation must be stt or tts.`);
    }
    return Object.freeze({
      artifactIds: parseStringArray(
        candidate.artifactIds,
        `${label}.artifactIds`,
      ),
      engine,
      executable: requireRelativePath(
        candidate.executable,
        `${label}.executable`,
      ),
      id,
      installDirectory: requireRelativePath(
        candidate.installDirectory,
        `${label}.installDirectory`,
      ),
      modelFiles: parseStringArray(candidate.modelFiles, `${label}.modelFiles`),
      operation,
      revision: requireString(candidate.revision, `${label}.revision`),
      desktopDriver: parseDesktopDriver(
        candidate.desktopDriver,
        `${label}.desktopDriver`,
        operation,
      ),
    });
  });
  return Object.freeze({
    candidates: Object.freeze(candidates),
    schemaVersion: 1,
  });
}

export function validateCandidateArtifacts(
  manifest: CandidateManifest,
  artifacts: VoiceArtifactManifest,
  architecture: ArtifactArchitecture,
): void {
  const byId = new Map(
    artifacts.artifacts.map((artifact) => [artifact.id, artifact]),
  );
  for (const candidate of manifest.candidates) {
    const selected = candidate.artifactIds.map((id) => {
      const artifact = byId.get(id);
      if (!artifact) {
        throw new Error(
          `Candidate ${candidate.id} references unknown artifact ${id}.`,
        );
      }
      if (!artifact.architectures.includes(architecture)) {
        throw new Error(
          `Candidate ${candidate.id} artifact ${id} does not support ${architecture}.`,
        );
      }
      return artifact;
    });
    const revisionIsBacked = selected.some(
      ({ sourceRevision }) => sourceRevision === candidate.revision,
    );
    const reviewedSourceCommit =
      candidate.engine === "whisper.cpp" &&
      /^[a-f\d]{40}$/u.test(candidate.revision);
    if (!revisionIsBacked && !reviewedSourceCommit) {
      throw new Error(
        `Candidate ${candidate.id} revision is not backed by an artifact.`,
      );
    }
  }
}

function parseDesktopDriver(
  value: unknown,
  label: string,
  operation: "stt" | "tts",
): DesktopCandidateDriver {
  const record = requireRecord(value, label);
  const args = parseStringArray(record.args, `${label}.args`);
  const inputCount = args.filter((argument) => argument === "{input}").length;
  const outputCount = args.filter((argument) => argument === "{output}").length;
  if (operation === "stt" && (inputCount !== 1 || outputCount !== 0)) {
    throw new Error(`${label}.args must contain one {input} for STT.`);
  }
  if (operation === "tts" && (inputCount !== 0 || outputCount !== 1)) {
    throw new Error(`${label}.args must contain one {output} for TTS.`);
  }
  const environmentRecord = requireRecord(
    record.environment,
    `${label}.environment`,
  );
  const environment = Object.fromEntries(
    Object.entries(environmentRecord).map(([key, item]) => [
      key,
      requireString(item, `${label}.environment.${key}`),
    ]),
  );
  const rawTranscriptFormat = record.transcriptFormat;
  if (
    operation === "stt" &&
    rawTranscriptFormat !== "plain" &&
    rawTranscriptFormat !== "sherpa-json"
  ) {
    throw new Error(`${label}.transcriptFormat is required for STT.`);
  }
  if (operation === "tts" && rawTranscriptFormat !== undefined) {
    throw new Error(`${label}.transcriptFormat is only valid for STT.`);
  }
  return Object.freeze({
    args,
    command: requireRelativePath(record.command, `${label}.command`),
    environment: Object.freeze(environment),
    ...(rawTranscriptFormat === "plain" || rawTranscriptFormat === "sherpa-json"
      ? { transcriptFormat: rawTranscriptFormat }
      : {}),
  });
}

function parseStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a nonempty array.`);
  }
  const values = value.map((item, index) =>
    requireString(item, `${label}[${index}]`),
  );
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates.`);
  }
  return Object.freeze(values);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a nonempty string.`);
  }
  return value;
}

function requireStableId(value: unknown, label: string): string {
  const id = requireString(value, label);
  if (!/^[a-z\d]+(?:[._-][a-z\d]+)*$/u.test(id)) {
    throw new Error(`${label} must be a stable lowercase identifier.`);
  }
  return id;
}

function requireRelativePath(value: unknown, label: string): string {
  const path = requireString(value, label);
  if (path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error(`${label} must be a safe relative path.`);
  }
  return path;
}
