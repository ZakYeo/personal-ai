import { createHash } from "node:crypto";

export interface VoiceBenchmarkInputContents {
  artifactContents: string;
  candidateContents: string;
  policyContents: string;
  recordingContents: string;
  ttsContents: string;
}

export function calculateVoiceBenchmarkFingerprint(
  contents: VoiceBenchmarkInputContents,
): string {
  return createHash("sha256")
    .update(
      [
        contents.recordingContents,
        contents.ttsContents,
        contents.candidateContents,
        contents.artifactContents,
        contents.policyContents,
      ].join("\0"),
    )
    .digest("hex");
}

export function requireVoiceBenchmarkFingerprint(
  actual: string,
  expected: string,
): void {
  if (actual !== expected) {
    throw new Error(
      "Benchmark result fingerprint does not match the current corpus, candidates, artifacts, and policy.",
    );
  }
}
