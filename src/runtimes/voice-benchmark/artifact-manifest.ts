import { join } from "node:path";

type ArtifactArchitecture = "arm64" | "x64";
type ArtifactKind = "corpus" | "engine" | "model";

interface VoiceArtifact {
  architectures: readonly ArtifactArchitecture[];
  fileName: string;
  id: string;
  kind: ArtifactKind;
  license: string;
  releasedAt: string;
  sha256: string;
  sizeBytes: number;
  sourceRevision: string;
  sourceUrl: string;
}

interface VoiceArtifactManifest {
  artifacts: readonly VoiceArtifact[];
  policy: Readonly<{ minimumCoolingOffDays: number }>;
  schemaVersion: 1;
}

interface InspectedArtifact {
  sha256: string;
  sizeBytes: number;
}

interface ArtifactVerificationDependencies {
  inspectFile(path: string): Promise<InspectedArtifact | undefined>;
}

type ArtifactVerification =
  | {
      artifactId: string;
      eligibleAt: string;
      filePath: string;
      releasedAt: string;
      status: "cooling-off";
    }
  | {
      artifactId: string;
      filePath: string;
      status: "missing";
    }
  | {
      artifactId: string;
      filePath: string;
      status: "verified";
    }
  | {
      actualSha256: string;
      actualSizeBytes: number;
      artifactId: string;
      expectedSha256: string;
      expectedSizeBytes: number;
      filePath: string;
      status: "checksum-mismatch";
    };

export function parseVoiceArtifactManifest(
  value: unknown,
): VoiceArtifactManifest {
  const record = requireRecord(value, "manifest");
  if (record.schemaVersion !== 1) {
    throw new Error("Voice artifact manifest schemaVersion must be 1.");
  }
  if (!Array.isArray(record.artifacts) || record.artifacts.length === 0) {
    throw new Error(
      "Voice artifact manifest artifacts must be a nonempty array.",
    );
  }
  const policyRecord = requireRecord(record.policy, "manifest.policy");
  const minimumCoolingOffDays = requirePositiveInteger(
    policyRecord.minimumCoolingOffDays,
    "manifest.policy.minimumCoolingOffDays",
  );
  if (minimumCoolingOffDays < 30) {
    throw new Error(
      "manifest.policy.minimumCoolingOffDays must be at least 30.",
    );
  }

  const ids = new Set<string>();
  const fileNames = new Set<string>();
  const artifacts = record.artifacts.map((artifact, index) => {
    const parsed = parseArtifact(artifact, index);
    if (ids.has(parsed.id)) {
      throw new Error(
        `Voice artifact manifest contains duplicate id ${parsed.id}.`,
      );
    }
    if (fileNames.has(parsed.fileName)) {
      throw new Error(
        `Voice artifact manifest contains duplicate fileName ${parsed.fileName}.`,
      );
    }
    ids.add(parsed.id);
    fileNames.add(parsed.fileName);
    return parsed;
  });

  return Object.freeze({
    artifacts: Object.freeze(artifacts),
    policy: Object.freeze({ minimumCoolingOffDays }),
    schemaVersion: 1 as const,
  });
}

export async function verifyVoiceArtifacts(
  manifest: VoiceArtifactManifest,
  cacheDirectory: string,
  architecture: ArtifactArchitecture,
  asOf: Date,
  dependencies: ArtifactVerificationDependencies,
): Promise<ArtifactVerification[]> {
  if (Number.isNaN(asOf.getTime())) {
    throw new Error("Artifact verification time must be a valid date.");
  }
  const results: ArtifactVerification[] = [];
  for (const artifact of manifest.artifacts.filter((candidate) =>
    candidate.architectures.includes(architecture),
  )) {
    const filePath = join(cacheDirectory, artifact.fileName);
    const eligibleAt = new Date(
      new Date(artifact.releasedAt).getTime() +
        manifest.policy.minimumCoolingOffDays * 24 * 60 * 60 * 1000,
    );
    if (asOf.getTime() < eligibleAt.getTime()) {
      results.push({
        artifactId: artifact.id,
        eligibleAt: eligibleAt.toISOString(),
        filePath,
        releasedAt: artifact.releasedAt,
        status: "cooling-off",
      });
      continue;
    }
    const inspected = await dependencies.inspectFile(filePath);
    if (!inspected) {
      results.push({ artifactId: artifact.id, filePath, status: "missing" });
      continue;
    }
    if (
      inspected.sha256 !== artifact.sha256 ||
      inspected.sizeBytes !== artifact.sizeBytes
    ) {
      results.push({
        actualSha256: inspected.sha256,
        actualSizeBytes: inspected.sizeBytes,
        artifactId: artifact.id,
        expectedSha256: artifact.sha256,
        expectedSizeBytes: artifact.sizeBytes,
        filePath,
        status: "checksum-mismatch",
      });
      continue;
    }
    results.push({ artifactId: artifact.id, filePath, status: "verified" });
  }
  return results;
}

function parseArtifact(value: unknown, index: number): VoiceArtifact {
  const label = `artifacts[${index}]`;
  const record = requireRecord(value, label);
  const id = requireSafeName(record.id, `${label}.id`);
  const fileName = requireSafeName(record.fileName, `${label}.fileName`);
  const sourceUrl = requireString(record.sourceUrl, `${label}.sourceUrl`);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch (error) {
    throw new Error(`${label}.sourceUrl must be a valid HTTPS URL.`, {
      cause: error,
    });
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error(`${label}.sourceUrl must be a valid HTTPS URL.`);
  }
  if (
    parsedUrl.hostname !== "github.com" &&
    parsedUrl.hostname !== "huggingface.co"
  ) {
    throw new Error(
      `${label}.sourceUrl must use a trusted upstream host (github.com or huggingface.co).`,
    );
  }

  const sha256 = requireString(record.sha256, `${label}.sha256`);
  if (!/^[a-f\d]{64}$/u.test(sha256)) {
    throw new Error(`${label}.sha256 must be 64 lowercase hex characters.`);
  }
  const architectures = parseArchitectures(record.architectures, label);
  const kind = record.kind;
  if (kind !== "corpus" && kind !== "engine" && kind !== "model") {
    throw new Error(`${label}.kind must be corpus, engine, or model.`);
  }
  const releasedAt = requireString(record.releasedAt, `${label}.releasedAt`);
  const releasedDate = new Date(releasedAt);
  if (
    Number.isNaN(releasedDate.getTime()) ||
    releasedDate.toISOString() !== releasedAt
  ) {
    throw new Error(`${label}.releasedAt must be a canonical ISO timestamp.`);
  }

  return Object.freeze({
    architectures,
    fileName,
    id,
    kind,
    license: requireString(record.license, `${label}.license`),
    releasedAt,
    sha256,
    sizeBytes: requirePositiveInteger(record.sizeBytes, `${label}.sizeBytes`),
    sourceRevision: requireString(
      record.sourceRevision,
      `${label}.sourceRevision`,
    ),
    sourceUrl,
  });
}

function parseArchitectures(
  value: unknown,
  label: string,
): readonly ArtifactArchitecture[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label}.architectures must be a nonempty array.`);
  }
  const architectures: ArtifactArchitecture[] = [];
  for (const architecture of value as unknown[]) {
    if (architecture !== "arm64" && architecture !== "x64") {
      throw new Error(`${label}.architectures contains an unsupported value.`);
    }
    architectures.push(architecture);
  }
  if (new Set(architectures).size !== architectures.length) {
    throw new Error(`${label}.architectures must not contain duplicates.`);
  }
  return Object.freeze(architectures);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireSafeName(value: unknown, label: string): string {
  const name = requireString(value, label);
  if (!/^[a-zA-Z\d][a-zA-Z\d._-]*$/u.test(name)) {
    throw new Error(`${label} must be a safe single path component.`);
  }
  return name;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a nonempty string.`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}
