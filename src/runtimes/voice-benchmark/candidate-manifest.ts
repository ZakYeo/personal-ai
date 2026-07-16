interface VoiceBenchmarkCandidate {
  artifactIds: readonly string[];
  engine: "piper" | "sherpa-onnx" | "whisper.cpp";
  executable: string;
  id: string;
  installDirectory: string;
  modelFiles: readonly string[];
  operation: "stt" | "tts";
  revision: string;
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
    });
  });
  return Object.freeze({
    candidates: Object.freeze(candidates),
    schemaVersion: 1,
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
